//! Handlers for the avatar images resource (PRD-154).
//!
//! Avatar images are nested under avatars:
//! `/avatars/{avatar_id}/images[/{id}]`

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::Json;
use x121_core::error::CoreError;
use x121_core::types::DbId;
use x121_db::models::avatar_image::{CreateAvatarImage, UpdateAvatarImage};
use x121_db::repositories::AvatarImageRepo;

use crate::error::{AppError, AppResult};
use crate::response::DataResponse;
use crate::state::AppState;

/// GET /api/v1/avatars/{avatar_id}/images
///
/// List all images for an avatar with enriched details.
pub async fn list_by_avatar(
    State(state): State<AppState>,
    Path(avatar_id): Path<DbId>,
) -> AppResult<Json<DataResponse<Vec<x121_db::models::avatar_image::AvatarImageDetail>>>> {
    let images = AvatarImageRepo::list_by_avatar_detailed(&state.pool, avatar_id).await?;
    Ok(Json(DataResponse { data: images }))
}

/// POST /api/v1/avatars/{avatar_id}/images
///
/// Create a new avatar image instance. Overrides `input.avatar_id` from the path.
pub async fn create(
    State(state): State<AppState>,
    Path(avatar_id): Path<DbId>,
    Json(mut input): Json<CreateAvatarImage>,
) -> AppResult<(
    StatusCode,
    Json<DataResponse<x121_db::models::avatar_image::AvatarImage>>,
)> {
    input.avatar_id = avatar_id;
    let image = AvatarImageRepo::create(&state.pool, &input).await?;
    Ok((StatusCode::CREATED, Json(DataResponse { data: image })))
}

/// PUT /api/v1/avatars/{avatar_id}/images/{id}
///
/// Update an avatar image (e.g., assign media_variant_id, change status).
pub async fn update(
    State(state): State<AppState>,
    Path((_avatar_id, id)): Path<(DbId, DbId)>,
    Json(input): Json<UpdateAvatarImage>,
) -> AppResult<Json<DataResponse<x121_db::models::avatar_image::AvatarImage>>> {
    let image = AvatarImageRepo::update(&state.pool, id, &input)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "AvatarImage",
            id,
        }))?;
    Ok(Json(DataResponse { data: image }))
}

/// DELETE /api/v1/avatars/{avatar_id}/images/{id}
///
/// Soft-delete an avatar image.
pub async fn delete(
    State(state): State<AppState>,
    Path((_avatar_id, id)): Path<(DbId, DbId)>,
) -> AppResult<StatusCode> {
    let deleted = AvatarImageRepo::soft_delete(&state.pool, id).await?;
    if deleted {
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(AppError::Core(CoreError::NotFound {
            entity: "AvatarImage",
            id,
        }))
    }
}

/// POST /api/v1/avatars/{avatar_id}/images/{id}/approve
///
/// Approve an avatar image.
pub async fn approve(
    State(state): State<AppState>,
    Path((_avatar_id, id)): Path<(DbId, DbId)>,
) -> AppResult<Json<DataResponse<x121_db::models::avatar_image::AvatarImage>>> {
    let image = AvatarImageRepo::approve(&state.pool, id)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "AvatarImage",
            id,
        }))?;
    Ok(Json(DataResponse { data: image }))
}

/// POST /api/v1/avatars/{avatar_id}/images/{id}/reject
///
/// Reject an avatar image.
pub async fn reject(
    State(state): State<AppState>,
    Path((_avatar_id, id)): Path<(DbId, DbId)>,
) -> AppResult<Json<DataResponse<x121_db::models::avatar_image::AvatarImage>>> {
    let image = AvatarImageRepo::reject(&state.pool, id)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "AvatarImage",
            id,
        }))?;
    Ok(Json(DataResponse { data: image }))
}
