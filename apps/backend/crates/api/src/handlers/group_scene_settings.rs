//! Handlers for per-group scene settings.
//!
//! Routes nested under `/projects/{project_id}/groups/{group_id}/scene-settings`.

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use x121_core::error::CoreError;
use x121_core::types::DbId;
use x121_db::models::group_scene_setting::{BulkGroupSceneSettings, ToggleSettingBody};
use x121_db::repositories::{AvatarGroupRepo, GroupSceneSettingRepo};

use crate::error::{AppError, AppResult};
use crate::response::DataResponse;
use crate::state::AppState;

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/// GET /api/v1/projects/{project_id}/groups/{group_id}/scene-settings
///
/// List effective scene settings for a group (three-level merge:
/// scene_type → project → group).
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

    let settings = GroupSceneSettingRepo::list_effective(&state.pool, group_id, project_id).await?;
    Ok(Json(DataResponse { data: settings }))
}

/// PUT /api/v1/projects/{project_id}/groups/{group_id}/scene-settings
///
/// Bulk upsert group scene settings.
pub async fn bulk_update(
    State(state): State<AppState>,
    Path((_project_id, group_id)): Path<(DbId, DbId)>,
    Json(body): Json<BulkGroupSceneSettings>,
) -> AppResult<impl IntoResponse> {
    let results = GroupSceneSettingRepo::bulk_upsert(&state.pool, group_id, &body.settings).await?;
    Ok(Json(DataResponse { data: results }))
}

/// PUT /api/v1/projects/{project_id}/groups/{group_id}/scene-settings/{scene_type_id}
///
/// Toggle a single scene setting for a group (scene_type level, no track).
pub async fn toggle_single(
    State(state): State<AppState>,
    Path((_project_id, group_id, scene_type_id)): Path<(DbId, DbId, DbId)>,
    Json(body): Json<ToggleSettingBody>,
) -> AppResult<impl IntoResponse> {
    let setting =
        GroupSceneSettingRepo::upsert(&state.pool, group_id, scene_type_id, None, body.is_enabled)
            .await?;
    Ok(Json(DataResponse { data: setting }))
}

/// PUT .../scene-settings/{scene_type_id}/tracks/{track_id}
///
/// Toggle a single scene setting for a specific track within a scene type.
pub async fn toggle_single_track(
    State(state): State<AppState>,
    Path((_project_id, group_id, scene_type_id, track_id)): Path<(DbId, DbId, DbId, DbId)>,
    Json(body): Json<ToggleSettingBody>,
) -> AppResult<impl IntoResponse> {
    let setting = GroupSceneSettingRepo::upsert(
        &state.pool,
        group_id,
        scene_type_id,
        Some(track_id),
        body.is_enabled,
    )
    .await?;
    Ok(Json(DataResponse { data: setting }))
}

/// DELETE .../scene-settings/{scene_type_id}
///
/// Remove a group scene setting at the scene_type level (no track).
pub async fn remove_override(
    State(state): State<AppState>,
    Path((_project_id, group_id, scene_type_id)): Path<(DbId, DbId, DbId)>,
) -> AppResult<StatusCode> {
    delete_override(&state, group_id, scene_type_id, None).await
}

/// DELETE .../scene-settings/{scene_type_id}/tracks/{track_id}
///
/// Remove a group scene setting for a specific track.
pub async fn remove_override_track(
    State(state): State<AppState>,
    Path((_project_id, group_id, scene_type_id, track_id)): Path<(DbId, DbId, DbId, DbId)>,
) -> AppResult<StatusCode> {
    delete_override(&state, group_id, scene_type_id, Some(track_id)).await
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/// Delete a group scene setting and return 204 or 404.
async fn delete_override(
    state: &AppState,
    group_id: DbId,
    scene_type_id: DbId,
    track_id: Option<DbId>,
) -> AppResult<StatusCode> {
    let removed =
        GroupSceneSettingRepo::delete(&state.pool, group_id, scene_type_id, track_id).await?;
    if removed {
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(AppError::Core(CoreError::NotFound {
            entity: "GroupSceneSetting",
            id: track_id.unwrap_or(scene_type_id),
        }))
    }
}
