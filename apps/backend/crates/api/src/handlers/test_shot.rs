//! Handlers for the Scene Preview & Quick Test feature (PRD-58).
//!
//! Provides endpoints for generating, listing, promoting, and deleting
//! test shots used for quick scene previews.

use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;

use serde::Deserialize;

use trulience_core::error::CoreError;
use trulience_core::search::{clamp_limit, clamp_offset, DEFAULT_SEARCH_LIMIT, MAX_SEARCH_LIMIT};
use trulience_core::test_shot::{
    self, DEFAULT_TEST_SHOT_DURATION_SECS,
};
use trulience_core::types::DbId;
use trulience_db::models::test_shot::{
    BatchTestShotRequest, BatchTestShotResponse, CreateTestShot, GenerateTestShotRequest,
    PromoteResponse, TestShot,
};
use trulience_db::repositories::TestShotRepo;

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
    pub character_id: Option<DbId>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Verify that a test shot exists, returning the full row.
async fn ensure_test_shot_exists(pool: &sqlx::PgPool, id: DbId) -> AppResult<TestShot> {
    TestShotRepo::find_by_id(pool, id)
        .await?
        .ok_or_else(|| {
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
    let duration = body.duration_secs.unwrap_or(DEFAULT_TEST_SHOT_DURATION_SECS);
    test_shot::validate_test_shot_params(duration)?;

    let input = CreateTestShot {
        scene_type_id: body.scene_type_id,
        character_id: body.character_id,
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
        character_id = body.character_id,
        user_id = auth.user_id,
        "Test shot created"
    );

    Ok((StatusCode::CREATED, Json(DataResponse { data: shot })))
}

// ---------------------------------------------------------------------------
// POST /test-shots/batch
// ---------------------------------------------------------------------------

/// Generate a batch of test shots for multiple characters.
///
/// Creates one test shot per character in the request, sharing the same
/// scene type, workflow, parameters, and seed image.
pub async fn batch_test_shots(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(body): Json<BatchTestShotRequest>,
) -> AppResult<impl IntoResponse> {
    test_shot::validate_batch_size(body.character_ids.len())?;

    let duration = body.duration_secs.unwrap_or(DEFAULT_TEST_SHOT_DURATION_SECS);
    test_shot::validate_test_shot_params(duration)?;

    let params = body.parameters.unwrap_or_else(|| serde_json::json!({}));
    let mut ids = Vec::with_capacity(body.character_ids.len());

    for &character_id in &body.character_ids {
        let input = CreateTestShot {
            scene_type_id: body.scene_type_id,
            character_id,
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
/// Requires `scene_type_id` query param; optionally filters by `character_id`.
pub async fn list_gallery(
    State(state): State<AppState>,
    Query(params): Query<GalleryParams>,
) -> AppResult<impl IntoResponse> {
    let limit = clamp_limit(params.limit, DEFAULT_SEARCH_LIMIT, MAX_SEARCH_LIMIT);
    let offset = clamp_offset(params.offset);

    let items = TestShotRepo::list_gallery(
        &state.pool,
        params.scene_type_id,
        params.character_id,
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
/// Validates that the shot has not already been promoted, marks it as
/// promoted, and returns the promotion details.
pub async fn promote_test_shot(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let shot = ensure_test_shot_exists(&state.pool, id).await?;
    test_shot::can_promote(shot.is_promoted)?;

    // In a full implementation, this would create a real scene record.
    // For now, we use a placeholder scene_id to demonstrate the flow.
    // The actual scene creation would be handled by the scene service.
    let placeholder_scene_id: DbId = 0;

    let promoted = TestShotRepo::mark_promoted(&state.pool, id, placeholder_scene_id)
        .await?
        .ok_or_else(|| {
            AppError::Core(CoreError::NotFound {
                entity: "TestShot",
                id,
            })
        })?;

    tracing::info!(
        test_shot_id = id,
        promoted_to_scene_id = placeholder_scene_id,
        user_id = auth.user_id,
        "Test shot promoted"
    );

    Ok(Json(DataResponse {
        data: PromoteResponse {
            test_shot_id: promoted.id,
            promoted_to_scene_id: placeholder_scene_id,
        },
    }))
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
