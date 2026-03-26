//! Handlers for per-avatar image overrides (PRD-154).
//!
//! Routes nested under `/avatars/{avatar_id}/image-settings`.

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use x121_core::error::CoreError;
use x121_core::types::DbId;
use x121_db::models::avatar_image_override::{BulkAvatarImageOverrides, ToggleImageSettingBody};
use x121_db::repositories::{AvatarImageOverrideRepo, AvatarRepo};

use crate::error::{AppError, AppResult};
use crate::response::DataResponse;
use crate::state::AppState;

/// GET /api/v1/avatars/{avatar_id}/image-settings
///
/// List effective image settings for an avatar (four-level merge).
/// The avatar's `project_id` and `group_id` are resolved automatically.
pub async fn list_effective(
    State(state): State<AppState>,
    Path(avatar_id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    // Look up the avatar to get its project_id and group_id
    let avatar = AvatarRepo::find_by_id(&state.pool, avatar_id)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "Avatar",
            id: avatar_id,
        }))?;

    let settings = AvatarImageOverrideRepo::list_effective(
        &state.pool,
        avatar_id,
        avatar.project_id,
        avatar.group_id,
    )
    .await?;
    Ok(Json(DataResponse { data: settings }))
}

/// PUT /api/v1/avatars/{avatar_id}/image-settings
///
/// Bulk upsert avatar image overrides.
pub async fn bulk_update(
    State(state): State<AppState>,
    Path(avatar_id): Path<DbId>,
    Json(body): Json<BulkAvatarImageOverrides>,
) -> AppResult<impl IntoResponse> {
    let results =
        AvatarImageOverrideRepo::bulk_upsert(&state.pool, avatar_id, &body.overrides).await?;
    Ok(Json(DataResponse { data: results }))
}

/// PUT /api/v1/avatars/{avatar_id}/image-settings/{image_type_id}
///
/// Toggle a single image override for an avatar (image_type level, no track).
pub async fn toggle_single(
    State(state): State<AppState>,
    Path((avatar_id, image_type_id)): Path<(DbId, DbId)>,
    Json(body): Json<ToggleImageSettingBody>,
) -> AppResult<impl IntoResponse> {
    let setting = AvatarImageOverrideRepo::upsert(
        &state.pool,
        avatar_id,
        image_type_id,
        None,
        body.is_enabled,
    )
    .await?;
    Ok(Json(DataResponse { data: setting }))
}

/// PUT /api/v1/avatars/{avatar_id}/image-settings/{image_type_id}/tracks/{track_id}
///
/// Toggle a single image override for a specific track within an image type.
pub async fn toggle_single_track(
    State(state): State<AppState>,
    Path((avatar_id, image_type_id, track_id)): Path<(DbId, DbId, DbId)>,
    Json(body): Json<ToggleImageSettingBody>,
) -> AppResult<impl IntoResponse> {
    let setting = AvatarImageOverrideRepo::upsert(
        &state.pool,
        avatar_id,
        image_type_id,
        Some(track_id),
        body.is_enabled,
    )
    .await?;
    Ok(Json(DataResponse { data: setting }))
}

/// DELETE /api/v1/avatars/{avatar_id}/image-settings/{image_type_id}
///
/// Remove an avatar image override at the image_type level (no track).
pub async fn remove_override(
    State(state): State<AppState>,
    Path((avatar_id, image_type_id)): Path<(DbId, DbId)>,
) -> AppResult<StatusCode> {
    delete_override(&state, avatar_id, image_type_id, None).await
}

/// DELETE /api/v1/avatars/{avatar_id}/image-settings/{image_type_id}/tracks/{track_id}
///
/// Remove an avatar image override for a specific track.
pub async fn remove_override_track(
    State(state): State<AppState>,
    Path((avatar_id, image_type_id, track_id)): Path<(DbId, DbId, DbId)>,
) -> AppResult<StatusCode> {
    delete_override(&state, avatar_id, image_type_id, Some(track_id)).await
}

/// Delete an avatar image override and return 204 or 404.
async fn delete_override(
    state: &AppState,
    avatar_id: DbId,
    image_type_id: DbId,
    track_id: Option<DbId>,
) -> AppResult<StatusCode> {
    let removed =
        AvatarImageOverrideRepo::delete(&state.pool, avatar_id, image_type_id, track_id).await?;
    if removed {
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(AppError::Core(CoreError::NotFound {
            entity: "AvatarImageOverride",
            id: track_id.unwrap_or(image_type_id),
        }))
    }
}
