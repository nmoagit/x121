//! Handlers for poster frame & thumbnail selection (PRD-96).
//!
//! Provides endpoints for setting, retrieving, and auto-selecting poster
//! frames for avatars and scenes.

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use serde::Serialize;
use sqlx::PgPool;

use x121_core::error::CoreError;
use x121_core::poster_frame::{select_best_frame, ENTITY_TYPE_AVATAR, ENTITY_TYPE_SCENE};
use x121_core::quality_gate::CHECK_FACE_CONFIDENCE;
use x121_core::types::DbId;
use x121_db::models::poster_frame::{PosterFrame, UpsertPosterFrame};
use x121_db::repositories::{
    AvatarRepo, PosterFrameRepo, ProjectRepo, QualityScoreRepo, SceneRepo, SegmentRepo,
};

use crate::error::{AppError, AppResult};
use crate::handlers::consistency_report::ensure_avatar_exists;
use crate::middleware::auth::AuthUser;
use crate::response::DataResponse;
use crate::state::AppState;

/// Response for the auto-select endpoint, reporting which avatars got posters.
#[derive(Debug, Serialize)]
pub struct AutoSelectResult {
    pub avatar_id: DbId,
    pub segment_id: Option<DbId>,
    pub selected: bool,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Ensure a scene exists (or 404).
async fn ensure_scene_exists(pool: &PgPool, id: DbId) -> AppResult<()> {
    SceneRepo::find_by_id(pool, id)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "Scene",
            id,
        }))?;
    Ok(())
}

/// Ensure a project exists (or 404).
async fn ensure_project_exists(pool: &PgPool, id: DbId) -> AppResult<()> {
    ProjectRepo::find_by_id(pool, id)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "Project",
            id,
        }))?;
    Ok(())
}

/// Shared helper: upsert a poster frame for any entity type.
async fn set_entity_poster(
    pool: &PgPool,
    entity_type: &str,
    entity_id: DbId,
    user_id: DbId,
    input: &UpsertPosterFrame,
) -> AppResult<PosterFrame> {
    let poster = PosterFrameRepo::upsert(pool, entity_type, entity_id, user_id, input).await?;

    tracing::info!(
        user_id,
        entity_type,
        entity_id,
        poster_frame_id = poster.id,
        "Poster frame set"
    );

    Ok(poster)
}

/// Shared helper: find a poster frame for any entity type (or 404).
async fn get_entity_poster(
    pool: &PgPool,
    entity_type: &str,
    entity_id: DbId,
) -> AppResult<PosterFrame> {
    PosterFrameRepo::find_by_entity(pool, entity_type, entity_id)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "PosterFrame",
            id: entity_id,
        }))
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/// POST /api/v1/scenes/{id}/poster-frame
///
/// Set or replace the poster frame for a scene.
pub async fn set_scene_poster(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(id): Path<DbId>,
    Json(input): Json<UpsertPosterFrame>,
) -> AppResult<impl IntoResponse> {
    ensure_scene_exists(&state.pool, id).await?;
    let poster =
        set_entity_poster(&state.pool, ENTITY_TYPE_SCENE, id, auth.user_id, &input).await?;
    Ok((StatusCode::CREATED, Json(DataResponse { data: poster })))
}

/// POST /api/v1/avatars/{id}/poster-frame
///
/// Set or replace the poster frame for a avatar.
pub async fn set_avatar_poster(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(id): Path<DbId>,
    Json(input): Json<UpsertPosterFrame>,
) -> AppResult<impl IntoResponse> {
    ensure_avatar_exists(&state.pool, id).await?;
    let poster =
        set_entity_poster(&state.pool, ENTITY_TYPE_AVATAR, id, auth.user_id, &input).await?;
    Ok((StatusCode::CREATED, Json(DataResponse { data: poster })))
}

/// GET /api/v1/scenes/{id}/poster-frame
///
/// Get the poster frame for a scene.
pub async fn get_scene_poster(
    _auth: AuthUser,
    State(state): State<AppState>,
    Path(id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let poster = get_entity_poster(&state.pool, ENTITY_TYPE_SCENE, id).await?;
    Ok(Json(DataResponse { data: poster }))
}

/// GET /api/v1/avatars/{id}/poster-frame
///
/// Get the poster frame for a avatar.
pub async fn get_avatar_poster(
    _auth: AuthUser,
    State(state): State<AppState>,
    Path(id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let poster = get_entity_poster(&state.pool, ENTITY_TYPE_AVATAR, id).await?;
    Ok(Json(DataResponse { data: poster }))
}

/// GET /api/v1/projects/{id}/poster-gallery
///
/// Returns all avatar poster frames for a project.
pub async fn get_poster_gallery(
    _auth: AuthUser,
    State(state): State<AppState>,
    Path(id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    ensure_project_exists(&state.pool, id).await?;

    let posters = PosterFrameRepo::get_project_gallery(&state.pool, id).await?;

    Ok(Json(DataResponse { data: posters }))
}

/// POST /api/v1/projects/{id}/auto-select-posters
///
/// For each avatar in the project, find the segment with the highest
/// `face_confidence` quality score and auto-set it as the poster frame.
pub async fn auto_select_posters(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    ensure_project_exists(&state.pool, id).await?;

    let avatars = AvatarRepo::list_by_project(&state.pool, id).await?;
    let mut results = Vec::with_capacity(avatars.len());

    for avatar in &avatars {
        let scenes = SceneRepo::list_by_avatar(&state.pool, avatar.id).await?;

        let mut scores: Vec<(DbId, f64)> = Vec::new();
        for scene in &scenes {
            let segments = SegmentRepo::list_by_scene(&state.pool, scene.id).await?;
            for segment in &segments {
                if let Some(qs) = QualityScoreRepo::find_by_segment_and_type(
                    &state.pool,
                    segment.id,
                    CHECK_FACE_CONFIDENCE,
                )
                .await?
                {
                    scores.push((segment.id, qs.score));
                }
            }
        }

        if let Some(best_segment_id) = select_best_frame(&scores) {
            let input = UpsertPosterFrame {
                segment_id: best_segment_id,
                frame_number: 0,
                image_path: format!(
                    "auto-selected/avatar_{}_segment_{}.jpg",
                    avatar.id, best_segment_id
                ),
                crop_settings_json: None,
                brightness: None,
                contrast: None,
            };

            PosterFrameRepo::upsert(
                &state.pool,
                ENTITY_TYPE_AVATAR,
                avatar.id,
                auth.user_id,
                &input,
            )
            .await?;

            results.push(AutoSelectResult {
                avatar_id: avatar.id,
                segment_id: Some(best_segment_id),
                selected: true,
            });
        } else {
            results.push(AutoSelectResult {
                avatar_id: avatar.id,
                segment_id: None,
                selected: false,
            });
        }
    }

    tracing::info!(
        user_id = auth.user_id,
        project_id = id,
        total_avatars = avatars.len(),
        selected_count = results.iter().filter(|r| r.selected).count(),
        "Auto-selected poster frames"
    );

    Ok((StatusCode::CREATED, Json(DataResponse { data: results })))
}
