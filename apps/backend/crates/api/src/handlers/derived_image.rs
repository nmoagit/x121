//! Handlers for the `/derived-images` resource.
//!
//! Derived images are nested under characters:
//! `/characters/{character_id}/derived-images[/{id}]`

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::Json;
use trulience_core::error::CoreError;
use trulience_core::types::DbId;
use trulience_db::models::image::{CreateDerivedImage, DerivedImage, UpdateDerivedImage};
use trulience_db::repositories::DerivedImageRepo;

use crate::error::{AppError, AppResult};
use crate::state::AppState;

/// POST /api/v1/characters/{character_id}/derived-images
///
/// Overrides `input.character_id` with the value from the URL path.
pub async fn create(
    State(state): State<AppState>,
    Path(character_id): Path<DbId>,
    Json(mut input): Json<CreateDerivedImage>,
) -> AppResult<(StatusCode, Json<DerivedImage>)> {
    input.character_id = character_id;
    let image = DerivedImageRepo::create(&state.pool, &input).await?;
    Ok((StatusCode::CREATED, Json(image)))
}

/// GET /api/v1/characters/{character_id}/derived-images
pub async fn list_by_character(
    State(state): State<AppState>,
    Path(character_id): Path<DbId>,
) -> AppResult<Json<Vec<DerivedImage>>> {
    let images = DerivedImageRepo::list_by_character(&state.pool, character_id).await?;
    Ok(Json(images))
}

/// GET /api/v1/characters/{character_id}/derived-images/{id}
pub async fn get_by_id(
    State(state): State<AppState>,
    Path((_character_id, id)): Path<(DbId, DbId)>,
) -> AppResult<Json<DerivedImage>> {
    let image = DerivedImageRepo::find_by_id(&state.pool, id)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "DerivedImage",
            id,
        }))?;
    Ok(Json(image))
}

/// PUT /api/v1/characters/{character_id}/derived-images/{id}
pub async fn update(
    State(state): State<AppState>,
    Path((_character_id, id)): Path<(DbId, DbId)>,
    Json(input): Json<UpdateDerivedImage>,
) -> AppResult<Json<DerivedImage>> {
    let image = DerivedImageRepo::update(&state.pool, id, &input)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "DerivedImage",
            id,
        }))?;
    Ok(Json(image))
}

/// DELETE /api/v1/characters/{character_id}/derived-images/{id}
pub async fn delete(
    State(state): State<AppState>,
    Path((_character_id, id)): Path<(DbId, DbId)>,
) -> AppResult<StatusCode> {
    let deleted = DerivedImageRepo::delete(&state.pool, id).await?;
    if deleted {
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(AppError::Core(CoreError::NotFound {
            entity: "DerivedImage",
            id,
        }))
    }
}
