//! Handlers for per-(image_type, track) workflow and prompt overrides (PRD-154).
//!
//! Endpoints are nested under `/image-types/{image_type_id}/track-configs`.

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::Json;
use x121_core::error::CoreError;
use x121_core::types::DbId;
use x121_db::models::image_type_track_config::{
    CreateImageTypeTrackConfig, ImageTypeTrackConfigWithTrack, UpdateImageTypeTrackConfig,
};
use x121_db::repositories::{ImageTypeRepo, ImageTypeTrackConfigRepo};

use crate::error::{AppError, AppResult};
use crate::response::DataResponse;
use crate::state::AppState;

/// GET /api/v1/image-types/{image_type_id}/track-configs
///
/// List all track configs for an image type, enriched with track name/slug.
pub async fn list(
    State(state): State<AppState>,
    Path(image_type_id): Path<DbId>,
) -> AppResult<Json<DataResponse<Vec<ImageTypeTrackConfigWithTrack>>>> {
    // Verify image type exists
    ImageTypeRepo::find_by_id(&state.pool, image_type_id)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "ImageType",
            id: image_type_id,
        }))?;

    let configs = ImageTypeTrackConfigRepo::list_by_image_type(&state.pool, image_type_id).await?;
    Ok(Json(DataResponse { data: configs }))
}

/// PUT /api/v1/image-types/{image_type_id}/track-configs/{track_id}
///
/// Upsert a track config. Creates if not exists, updates if it does.
pub async fn upsert(
    State(state): State<AppState>,
    Path((image_type_id, track_id)): Path<(DbId, DbId)>,
    Json(body): Json<UpdateImageTypeTrackConfig>,
) -> AppResult<Json<DataResponse<x121_db::models::image_type_track_config::ImageTypeTrackConfig>>> {
    // Verify image type exists
    ImageTypeRepo::find_by_id(&state.pool, image_type_id)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "ImageType",
            id: image_type_id,
        }))?;

    let input = CreateImageTypeTrackConfig {
        image_type_id,
        track_id,
        workflow_id: body.workflow_id,
        prompt_template: body.prompt_template,
        negative_prompt_template: body.negative_prompt_template,
    };

    let config = ImageTypeTrackConfigRepo::upsert(&state.pool, &input).await?;
    Ok(Json(DataResponse { data: config }))
}

/// DELETE /api/v1/image-types/{image_type_id}/track-configs/{track_id}
///
/// Delete a track config by image type and track.
pub async fn delete(
    State(state): State<AppState>,
    Path((image_type_id, track_id)): Path<(DbId, DbId)>,
) -> AppResult<StatusCode> {
    let deleted = ImageTypeTrackConfigRepo::delete_by_image_type_and_track(
        &state.pool,
        image_type_id,
        track_id,
    )
    .await?;
    if deleted {
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(AppError::Core(CoreError::NotFound {
            entity: "ImageTypeTrackConfig",
            id: track_id,
        }))
    }
}
