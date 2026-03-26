//! Handlers for per-group image settings (PRD-154).
//!
//! Routes nested under `/projects/{project_id}/groups/{group_id}/image-settings`.

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use x121_core::error::CoreError;
use x121_core::types::DbId;
use x121_db::models::group_image_setting::{BulkGroupImageSettings, ToggleImageSettingBody};
use x121_db::repositories::{AvatarGroupRepo, GroupImageSettingRepo};

use crate::error::{AppError, AppResult};
use crate::response::DataResponse;
use crate::state::AppState;

/// GET /api/v1/projects/{project_id}/groups/{group_id}/image-settings
///
/// List effective image settings for a group (three-level merge:
/// image_type -> project -> group).
pub async fn list_effective(
    State(state): State<AppState>,
    Path((project_id, group_id)): Path<(DbId, DbId)>,
) -> AppResult<impl IntoResponse> {
    // Verify the group exists and belongs to this project.
    let group = AvatarGroupRepo::find_by_id(&state.pool, group_id)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "AvatarGroup",
            id: group_id,
        }))?;

    if group.project_id != project_id {
        return Err(AppError::Core(CoreError::NotFound {
            entity: "AvatarGroup",
            id: group_id,
        }));
    }

    let settings = GroupImageSettingRepo::list_effective(&state.pool, group_id, project_id).await?;
    Ok(Json(DataResponse { data: settings }))
}

/// PUT /api/v1/projects/{project_id}/groups/{group_id}/image-settings
///
/// Bulk upsert group image settings.
pub async fn bulk_update(
    State(state): State<AppState>,
    Path((_project_id, group_id)): Path<(DbId, DbId)>,
    Json(body): Json<BulkGroupImageSettings>,
) -> AppResult<impl IntoResponse> {
    let results = GroupImageSettingRepo::bulk_upsert(&state.pool, group_id, &body.settings).await?;
    Ok(Json(DataResponse { data: results }))
}

/// PUT /api/v1/projects/{project_id}/groups/{group_id}/image-settings/{image_type_id}
///
/// Toggle a single image setting for a group (image_type level, no track).
pub async fn toggle_single(
    State(state): State<AppState>,
    Path((_project_id, group_id, image_type_id)): Path<(DbId, DbId, DbId)>,
    Json(body): Json<ToggleImageSettingBody>,
) -> AppResult<impl IntoResponse> {
    let setting =
        GroupImageSettingRepo::upsert(&state.pool, group_id, image_type_id, None, body.is_enabled)
            .await?;
    Ok(Json(DataResponse { data: setting }))
}

/// PUT .../image-settings/{image_type_id}/tracks/{track_id}
///
/// Toggle a single image setting for a specific track within an image type.
pub async fn toggle_single_track(
    State(state): State<AppState>,
    Path((_project_id, group_id, image_type_id, track_id)): Path<(DbId, DbId, DbId, DbId)>,
    Json(body): Json<ToggleImageSettingBody>,
) -> AppResult<impl IntoResponse> {
    let setting = GroupImageSettingRepo::upsert(
        &state.pool,
        group_id,
        image_type_id,
        Some(track_id),
        body.is_enabled,
    )
    .await?;
    Ok(Json(DataResponse { data: setting }))
}

/// DELETE .../image-settings/{image_type_id}
///
/// Remove a group image setting at the image_type level (no track).
pub async fn remove_override(
    State(state): State<AppState>,
    Path((_project_id, group_id, image_type_id)): Path<(DbId, DbId, DbId)>,
) -> AppResult<StatusCode> {
    delete_override(&state, group_id, image_type_id, None).await
}

/// DELETE .../image-settings/{image_type_id}/tracks/{track_id}
///
/// Remove a group image setting for a specific track.
pub async fn remove_override_track(
    State(state): State<AppState>,
    Path((_project_id, group_id, image_type_id, track_id)): Path<(DbId, DbId, DbId, DbId)>,
) -> AppResult<StatusCode> {
    delete_override(&state, group_id, image_type_id, Some(track_id)).await
}

/// Delete a group image setting and return 204 or 404.
async fn delete_override(
    state: &AppState,
    group_id: DbId,
    image_type_id: DbId,
    track_id: Option<DbId>,
) -> AppResult<StatusCode> {
    let removed =
        GroupImageSettingRepo::delete(&state.pool, group_id, image_type_id, track_id).await?;
    if removed {
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(AppError::Core(CoreError::NotFound {
            entity: "GroupImageSetting",
            id: track_id.unwrap_or(image_type_id),
        }))
    }
}
