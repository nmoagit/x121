//! Handlers for the `/image-types` resource (PRD-154).
//!
//! Image types are pipeline-scoped: `/image-types[/{id}]`

use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use serde::Deserialize;
use x121_core::error::CoreError;
use x121_core::types::DbId;
use x121_db::models::image_type::{CreateImageType, UpdateImageType};
use x121_db::repositories::ImageTypeRepo;

use crate::error::{AppError, AppResult};
use crate::response::DataResponse;
use crate::state::AppState;

/// Query parameters for image type list endpoints.
#[derive(Debug, Deserialize)]
pub struct ImageTypeListParams {
    /// Required: only image types belonging to this pipeline are returned.
    pub pipeline_id: DbId,
}

/// POST /api/v1/image-types
///
/// Create a new image type within a pipeline.
pub async fn create(
    State(state): State<AppState>,
    Json(input): Json<CreateImageType>,
) -> AppResult<(StatusCode, impl IntoResponse)> {
    let image_type = ImageTypeRepo::create(&state.pool, &input).await?;
    Ok((StatusCode::CREATED, Json(DataResponse { data: image_type })))
}

/// GET /api/v1/image-types?pipeline_id=N
///
/// List all image types for a pipeline with their associated tracks.
pub async fn list(
    State(state): State<AppState>,
    Query(params): Query<ImageTypeListParams>,
) -> AppResult<impl IntoResponse> {
    let entries =
        ImageTypeRepo::list_by_pipeline_with_tracks(&state.pool, params.pipeline_id).await?;
    Ok(Json(DataResponse { data: entries }))
}

/// GET /api/v1/image-types/{id}
///
/// Get a single image type with its tracks.
pub async fn get_by_id(
    State(state): State<AppState>,
    Path(id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let with_tracks = ImageTypeRepo::find_by_id_with_tracks(&state.pool, id)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "ImageType",
            id,
        }))?;
    Ok(Json(DataResponse { data: with_tracks }))
}

/// PUT /api/v1/image-types/{id}
///
/// Update an image type. When `track_ids` is provided, replaces all track
/// associations atomically.
pub async fn update(
    State(state): State<AppState>,
    Path(id): Path<DbId>,
    Json(input): Json<UpdateImageType>,
) -> AppResult<impl IntoResponse> {
    let track_ids = input.track_ids.clone();

    let image_type = ImageTypeRepo::update(&state.pool, id, &input)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "ImageType",
            id,
        }))?;

    // Sync track associations if provided
    if let Some(ids) = track_ids {
        ImageTypeRepo::set_tracks(&state.pool, id, &ids).await?;
    }

    Ok(Json(DataResponse { data: image_type }))
}

/// DELETE /api/v1/image-types/{id}
///
/// Soft-delete an image type.
pub async fn delete(State(state): State<AppState>, Path(id): Path<DbId>) -> AppResult<StatusCode> {
    let deleted = ImageTypeRepo::soft_delete(&state.pool, id).await?;
    if deleted {
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(AppError::Core(CoreError::NotFound {
            entity: "ImageType",
            id,
        }))
    }
}
