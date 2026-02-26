//! Handlers for the `/source-images` resource.
//!
//! Source images are nested under characters:
//! `/characters/{character_id}/source-images[/{id}]`

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::Json;
use x121_core::error::CoreError;
use x121_core::types::DbId;
use x121_db::models::image::{CreateSourceImage, SourceImage, UpdateSourceImage};
use x121_db::repositories::SourceImageRepo;

use crate::error::{AppError, AppResult};
use crate::state::AppState;

/// POST /api/v1/characters/{character_id}/source-images
///
/// Overrides `input.character_id` with the value from the URL path.
pub async fn create(
    State(state): State<AppState>,
    Path(character_id): Path<DbId>,
    Json(mut input): Json<CreateSourceImage>,
) -> AppResult<(StatusCode, Json<SourceImage>)> {
    input.character_id = character_id;
    let image = SourceImageRepo::create(&state.pool, &input).await?;
    Ok((StatusCode::CREATED, Json(image)))
}

/// GET /api/v1/characters/{character_id}/source-images
pub async fn list_by_character(
    State(state): State<AppState>,
    Path(character_id): Path<DbId>,
) -> AppResult<Json<Vec<SourceImage>>> {
    let images = SourceImageRepo::list_by_character(&state.pool, character_id).await?;
    Ok(Json(images))
}

/// GET /api/v1/characters/{character_id}/source-images/{id}
pub async fn get_by_id(
    State(state): State<AppState>,
    Path((_character_id, id)): Path<(DbId, DbId)>,
) -> AppResult<Json<SourceImage>> {
    let image = SourceImageRepo::find_by_id(&state.pool, id)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "SourceImage",
            id,
        }))?;
    Ok(Json(image))
}

/// PUT /api/v1/characters/{character_id}/source-images/{id}
pub async fn update(
    State(state): State<AppState>,
    Path((_character_id, id)): Path<(DbId, DbId)>,
    Json(input): Json<UpdateSourceImage>,
) -> AppResult<Json<SourceImage>> {
    let image = SourceImageRepo::update(&state.pool, id, &input)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "SourceImage",
            id,
        }))?;
    Ok(Json(image))
}

/// DELETE /api/v1/characters/{character_id}/source-images/{id}
pub async fn delete(
    State(state): State<AppState>,
    Path((_character_id, id)): Path<(DbId, DbId)>,
) -> AppResult<StatusCode> {
    let deleted = SourceImageRepo::soft_delete(&state.pool, id).await?;
    if deleted {
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(AppError::Core(CoreError::NotFound {
            entity: "SourceImage",
            id,
        }))
    }
}
