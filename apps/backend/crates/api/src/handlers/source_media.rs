//! Handlers for the `/source-images` resource.
//!
//! Source images are nested under avatars:
//! `/avatars/{avatar_id}/source-images[/{id}]`

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::Json;
use x121_core::error::CoreError;
use x121_core::types::DbId;
use x121_db::models::media::{CreateSourceMedia, SourceMedia, UpdateSourceMedia};
use x121_db::repositories::SourceMediaRepo;

use crate::error::{AppError, AppResult};
use crate::state::AppState;

/// POST /api/v1/avatars/{avatar_id}/source-images
///
/// Overrides `input.avatar_id` with the value from the URL path.
pub async fn create(
    State(state): State<AppState>,
    Path(avatar_id): Path<DbId>,
    Json(mut input): Json<CreateSourceMedia>,
) -> AppResult<(StatusCode, Json<SourceMedia>)> {
    input.avatar_id = avatar_id;
    let image = SourceMediaRepo::create(&state.pool, &input).await?;
    Ok((StatusCode::CREATED, Json(image)))
}

/// GET /api/v1/avatars/{avatar_id}/source-images
pub async fn list_by_avatar(
    State(state): State<AppState>,
    Path(avatar_id): Path<DbId>,
) -> AppResult<Json<Vec<SourceMedia>>> {
    let images = SourceMediaRepo::list_by_avatar(&state.pool, avatar_id).await?;
    Ok(Json(images))
}

/// GET /api/v1/avatars/{avatar_id}/source-images/{id}
pub async fn get_by_id(
    State(state): State<AppState>,
    Path((_avatar_id, id)): Path<(DbId, DbId)>,
) -> AppResult<Json<SourceMedia>> {
    let image = SourceMediaRepo::find_by_id(&state.pool, id)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "SourceMedia",
            id,
        }))?;
    Ok(Json(image))
}

/// PUT /api/v1/avatars/{avatar_id}/source-images/{id}
pub async fn update(
    State(state): State<AppState>,
    Path((_avatar_id, id)): Path<(DbId, DbId)>,
    Json(input): Json<UpdateSourceMedia>,
) -> AppResult<Json<SourceMedia>> {
    let image = SourceMediaRepo::update(&state.pool, id, &input)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "SourceMedia",
            id,
        }))?;
    Ok(Json(image))
}

/// DELETE /api/v1/avatars/{avatar_id}/source-images/{id}
pub async fn delete(
    State(state): State<AppState>,
    Path((_avatar_id, id)): Path<(DbId, DbId)>,
) -> AppResult<StatusCode> {
    let deleted = SourceMediaRepo::soft_delete(&state.pool, id).await?;
    if deleted {
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(AppError::Core(CoreError::NotFound {
            entity: "SourceMedia",
            id,
        }))
    }
}
