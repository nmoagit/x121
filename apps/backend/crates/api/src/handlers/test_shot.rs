//! Handlers for the Scene Preview & Quick Test feature (PRD-58).
//!
//! Provides endpoints for generating, listing, promoting, and deleting
//! test shots used for quick scene previews.

use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;

use serde::Deserialize;

use x121_core::error::CoreError;
use x121_core::search::{clamp_limit, clamp_offset, DEFAULT_SEARCH_LIMIT, MAX_SEARCH_LIMIT};
use x121_core::test_shot::{self, DEFAULT_TEST_SHOT_DURATION_SECS};
use x121_core::types::DbId;
use x121_db::models::scene::CreateScene;
use x121_db::models::test_shot::{
    BatchTestShotRequest, BatchTestShotResponse, CreateTestShot, GenerateTestShotRequest,
    PromoteResponse, TestShot,
};
use x121_db::repositories::{MediaVariantRepo, SceneRepo, TestShotRepo};

use crate::error::{AppError, AppResult};
use crate::middleware::auth::AuthUser;
use crate::response::DataResponse;
use crate::state::AppState;

// ---------------------------------------------------------------------------
// Query parameters
// ---------------------------------------------------------------------------

/// Pagination and filter parameters for the gallery listing.
#[derive(Debug, Deserialize)]
pub struct GalleryParams {
    pub scene_type_id: DbId,
    pub avatar_id: Option<DbId>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Verify that a test shot exists, returning the full row.
async fn ensure_test_shot_exists(pool: &sqlx::PgPool, id: DbId) -> AppResult<TestShot> {
    TestShotRepo::find_by_id(pool, id).await?.ok_or_else(|| {
        AppError::Core(CoreError::NotFound {
            entity: "TestShot",
            id,
        })
    })
}

// ---------------------------------------------------------------------------
// POST /test-shots
// ---------------------------------------------------------------------------

/// Generate a single test shot.
///
/// Validates duration parameters, creates the database record, and returns
/// the created test shot.
pub async fn generate_test_shot(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(body): Json<GenerateTestShotRequest>,
) -> AppResult<impl IntoResponse> {
    let duration = body
        .duration_secs
        .unwrap_or(DEFAULT_TEST_SHOT_DURATION_SECS);
    test_shot::validate_test_shot_params(duration)?;

    let input = CreateTestShot {
        scene_type_id: body.scene_type_id,
        avatar_id: body.avatar_id,
        workflow_id: body.workflow_id,
        parameters: body.parameters.unwrap_or_else(|| serde_json::json!({})),
        seed_image_path: body.seed_image_path,
        duration_secs: Some(duration),
        created_by_id: auth.user_id,
    };

    let shot = TestShotRepo::create(&state.pool, &input).await?;

    tracing::info!(
        test_shot_id = shot.id,
        scene_type_id = body.scene_type_id,
        avatar_id = body.avatar_id,
        user_id = auth.user_id,
        "Test shot created"
    );

    Ok((StatusCode::CREATED, Json(DataResponse { data: shot })))
}

// ---------------------------------------------------------------------------
// POST /test-shots/batch
// ---------------------------------------------------------------------------

/// Generate a batch of test shots for multiple avatars.
///
/// Creates one test shot per avatar in the request, sharing the same
/// scene type, workflow, parameters, and seed image.
pub async fn batch_test_shots(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(body): Json<BatchTestShotRequest>,
) -> AppResult<impl IntoResponse> {
    test_shot::validate_batch_size(body.avatar_ids.len())?;

    let duration = body
        .duration_secs
        .unwrap_or(DEFAULT_TEST_SHOT_DURATION_SECS);
    test_shot::validate_test_shot_params(duration)?;

    let params = body.parameters.unwrap_or_else(|| serde_json::json!({}));
    let mut ids = Vec::with_capacity(body.avatar_ids.len());

    for &avatar_id in &body.avatar_ids {
        let input = CreateTestShot {
            scene_type_id: body.scene_type_id,
            avatar_id,
            workflow_id: body.workflow_id,
            parameters: params.clone(),
            seed_image_path: body.seed_image_path.clone(),
            duration_secs: Some(duration),
            created_by_id: auth.user_id,
        };
        let shot = TestShotRepo::create(&state.pool, &input).await?;
        ids.push(shot.id);
    }

    let count = ids.len();

    tracing::info!(
        count,
        scene_type_id = body.scene_type_id,
        user_id = auth.user_id,
        "Batch test shots created"
    );

    Ok((
        StatusCode::CREATED,
        Json(DataResponse {
            data: BatchTestShotResponse {
                test_shot_ids: ids,
                count,
            },
        }),
    ))
}

// ---------------------------------------------------------------------------
// GET /test-shots
// ---------------------------------------------------------------------------

/// List test shots as a filterable gallery.
///
/// Requires `scene_type_id` query param; optionally filters by `avatar_id`.
pub async fn list_gallery(
    State(state): State<AppState>,
    Query(params): Query<GalleryParams>,
) -> AppResult<impl IntoResponse> {
    let limit = clamp_limit(params.limit, DEFAULT_SEARCH_LIMIT, MAX_SEARCH_LIMIT);
    let offset = clamp_offset(params.offset);

    let items = TestShotRepo::list_gallery(
        &state.pool,
        params.scene_type_id,
        params.avatar_id,
        limit,
        offset,
    )
    .await?;

    tracing::debug!(
        count = items.len(),
        scene_type_id = params.scene_type_id,
        "Listed test shot gallery"
    );

    Ok(Json(DataResponse { data: items }))
}

// ---------------------------------------------------------------------------
// GET /test-shots/{id}
// ---------------------------------------------------------------------------

/// Get a single test shot by ID.
pub async fn get_test_shot(
    State(state): State<AppState>,
    Path(id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let shot = ensure_test_shot_exists(&state.pool, id).await?;
    Ok(Json(DataResponse { data: shot }))
}

// ---------------------------------------------------------------------------
// POST /test-shots/{id}/promote
// ---------------------------------------------------------------------------

/// Promote a test shot to a full scene.
///
/// Creates a real scene record from the test shot data: uses the shot's
/// `avatar_id` and `scene_type_id`, and resolves the avatar's hero
/// image variant for the `media_variant_id` field. Marks the test shot
/// as promoted and links it to the newly created scene.
pub async fn promote_test_shot(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let shot = ensure_test_shot_exists(&state.pool, id).await?;
    test_shot::can_promote(shot.is_promoted)?;

    // Resolve the media_variant_id: prefer the hero variant for this avatar,
    // fall back to the most recently created variant.
    let media_variant_id = resolve_image_variant(&state.pool, shot.avatar_id).await?;

    let create_scene = CreateScene {
        avatar_id: shot.avatar_id,
        scene_type_id: shot.scene_type_id,
        media_variant_id: Some(media_variant_id),
        track_id: None,
        status_id: None,
        transition_mode: None,
        total_segments_estimated: None,
        total_segments_completed: None,
        actual_duration_secs: shot.duration_secs,
        transition_segment_index: None,
        generation_started_at: None,
        generation_completed_at: None,
    };

    let scene = SceneRepo::create(&state.pool, &create_scene).await?;

    let promoted = TestShotRepo::mark_promoted(&state.pool, id, scene.id)
        .await?
        .ok_or_else(|| {
            AppError::Core(CoreError::NotFound {
                entity: "TestShot",
                id,
            })
        })?;

    tracing::info!(
        test_shot_id = id,
        promoted_to_scene_id = scene.id,
        user_id = auth.user_id,
        "Test shot promoted to scene"
    );

    Ok(Json(DataResponse {
        data: PromoteResponse {
            test_shot_id: promoted.id,
            promoted_to_scene_id: scene.id,
        },
    }))
}

/// Resolve the image variant ID for a avatar to use when creating a scene.
///
/// Prefers the hero variant (of any type), falling back to the most recently
/// created variant. Returns an error if the avatar has no image variants.
async fn resolve_image_variant(pool: &sqlx::PgPool, avatar_id: DbId) -> AppResult<DbId> {
    let variants = MediaVariantRepo::list_by_avatar(pool, avatar_id).await?;

    // Prefer the hero variant.
    if let Some(hero) = variants.iter().find(|v| v.is_hero) {
        return Ok(hero.id);
    }

    // Fall back to the most recently created variant.
    variants.first().map(|v| v.id).ok_or_else(|| {
        AppError::BadRequest(format!(
            "Avatar {avatar_id} has no image variants; cannot promote test shot"
        ))
    })
}

// ---------------------------------------------------------------------------
// DELETE /test-shots/{id}
// ---------------------------------------------------------------------------

/// Delete a test shot by ID.
pub async fn delete_test_shot(
    State(state): State<AppState>,
    _auth: AuthUser,
    Path(id): Path<DbId>,
) -> AppResult<StatusCode> {
    let deleted = TestShotRepo::delete(&state.pool, id).await?;
    if deleted {
        tracing::info!(id, "Test shot deleted");
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(AppError::Core(CoreError::NotFound {
            entity: "TestShot",
            id,
        }))
    }
}
