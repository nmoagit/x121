//! Handlers for the `/video-specs` resource (PRD-113).
//!
//! Standard CRUD for video specification requirements.

use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::Json;
use serde::Deserialize;
use x121_core::error::CoreError;
use x121_core::types::DbId;
use x121_db::models::video_spec::{
    CreateVideoSpecRequirement, UpdateVideoSpecRequirement, VideoSpecRequirement,
};
use x121_db::repositories::VideoSpecRequirementRepo;

use crate::error::{AppError, AppResult};
use crate::state::AppState;

// ---------------------------------------------------------------------------
// Query parameters
// ---------------------------------------------------------------------------

/// Query parameters for listing video specs.
#[derive(Debug, Deserialize)]
pub struct ListSpecsQuery {
    pub project_id: Option<DbId>,
    pub scene_type_id: Option<DbId>,
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/// GET /api/v1/video-specs
pub async fn list_specs(
    State(state): State<AppState>,
    Query(params): Query<ListSpecsQuery>,
) -> AppResult<Json<Vec<VideoSpecRequirement>>> {
    let specs =
        VideoSpecRequirementRepo::list_active(&state.pool, params.project_id, params.scene_type_id)
            .await?;
    Ok(Json(specs))
}

/// GET /api/v1/video-specs/{id}
pub async fn get_spec(
    State(state): State<AppState>,
    Path(id): Path<DbId>,
) -> AppResult<Json<VideoSpecRequirement>> {
    let spec = VideoSpecRequirementRepo::find_by_id(&state.pool, id)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "VideoSpecRequirement",
            id,
        }))?;
    Ok(Json(spec))
}

/// POST /api/v1/video-specs
pub async fn create_spec(
    State(state): State<AppState>,
    Json(input): Json<CreateVideoSpecRequirement>,
) -> AppResult<(StatusCode, Json<VideoSpecRequirement>)> {
    let spec = VideoSpecRequirementRepo::create(&state.pool, &input).await?;
    Ok((StatusCode::CREATED, Json(spec)))
}

/// PUT /api/v1/video-specs/{id}
pub async fn update_spec(
    State(state): State<AppState>,
    Path(id): Path<DbId>,
    Json(input): Json<UpdateVideoSpecRequirement>,
) -> AppResult<Json<VideoSpecRequirement>> {
    let spec = VideoSpecRequirementRepo::update(&state.pool, id, &input)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "VideoSpecRequirement",
            id,
        }))?;
    Ok(Json(spec))
}

/// DELETE /api/v1/video-specs/{id}
pub async fn delete_spec(
    State(state): State<AppState>,
    Path(id): Path<DbId>,
) -> AppResult<StatusCode> {
    let deleted = VideoSpecRequirementRepo::delete(&state.pool, id).await?;
    if deleted {
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(AppError::Core(CoreError::NotFound {
            entity: "VideoSpecRequirement",
            id,
        }))
    }
}
