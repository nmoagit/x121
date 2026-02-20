//! Handlers for the `/image-variants` resource.
//!
//! Image variants are nested under characters:
//! `/characters/{character_id}/image-variants[/{id}]`

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::Json;
use trulience_core::error::CoreError;
use trulience_core::types::DbId;
use trulience_db::models::image::{CreateImageVariant, ImageVariant, UpdateImageVariant};
use trulience_db::repositories::ImageVariantRepo;

use crate::error::{AppError, AppResult};
use crate::state::AppState;

/// POST /api/v1/characters/{character_id}/image-variants
///
/// Overrides `input.character_id` with the value from the URL path.
pub async fn create(
    State(state): State<AppState>,
    Path(character_id): Path<DbId>,
    Json(mut input): Json<CreateImageVariant>,
) -> AppResult<(StatusCode, Json<ImageVariant>)> {
    input.character_id = character_id;
    let variant = ImageVariantRepo::create(&state.pool, &input).await?;
    Ok((StatusCode::CREATED, Json(variant)))
}

/// GET /api/v1/characters/{character_id}/image-variants
pub async fn list_by_character(
    State(state): State<AppState>,
    Path(character_id): Path<DbId>,
) -> AppResult<Json<Vec<ImageVariant>>> {
    let variants = ImageVariantRepo::list_by_character(&state.pool, character_id).await?;
    Ok(Json(variants))
}

/// GET /api/v1/characters/{character_id}/image-variants/{id}
pub async fn get_by_id(
    State(state): State<AppState>,
    Path((_character_id, id)): Path<(DbId, DbId)>,
) -> AppResult<Json<ImageVariant>> {
    let variant = ImageVariantRepo::find_by_id(&state.pool, id)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "ImageVariant",
            id,
        }))?;
    Ok(Json(variant))
}

/// PUT /api/v1/characters/{character_id}/image-variants/{id}
pub async fn update(
    State(state): State<AppState>,
    Path((_character_id, id)): Path<(DbId, DbId)>,
    Json(input): Json<UpdateImageVariant>,
) -> AppResult<Json<ImageVariant>> {
    let variant = ImageVariantRepo::update(&state.pool, id, &input)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "ImageVariant",
            id,
        }))?;
    Ok(Json(variant))
}

/// DELETE /api/v1/characters/{character_id}/image-variants/{id}
pub async fn delete(
    State(state): State<AppState>,
    Path((_character_id, id)): Path<(DbId, DbId)>,
) -> AppResult<StatusCode> {
    let deleted = ImageVariantRepo::soft_delete(&state.pool, id).await?;
    if deleted {
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(AppError::Core(CoreError::NotFound {
            entity: "ImageVariant",
            id,
        }))
    }
}
