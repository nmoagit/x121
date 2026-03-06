//! Handlers for per-project scene settings (PRD-111, PRD-123).
//!
//! Routes nested under `/projects/{project_id}/scene-settings`.

use axum::extract::{Path, State};
use axum::response::IntoResponse;
use axum::Json;
use x121_core::types::DbId;
use x121_db::models::project_scene_setting::{BulkProjectSceneSettings, ToggleSettingBody};
use x121_db::repositories::ProjectSceneSettingRepo;

use crate::error::AppResult;
use crate::response::DataResponse;
use crate::state::AppState;

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/// GET /api/v1/projects/{project_id}/scene-settings
///
/// List effective scene settings for a project (scene_type defaults + overrides).
/// Returns one row per (scene_type, track) pair.
pub async fn list_effective(
    State(state): State<AppState>,
    Path(project_id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let settings = ProjectSceneSettingRepo::list_effective(&state.pool, project_id).await?;
    Ok(Json(DataResponse { data: settings }))
}

/// PUT /api/v1/projects/{project_id}/scene-settings
///
/// Bulk upsert project scene settings.
pub async fn bulk_update(
    State(state): State<AppState>,
    Path(project_id): Path<DbId>,
    Json(body): Json<BulkProjectSceneSettings>,
) -> AppResult<impl IntoResponse> {
    let results =
        ProjectSceneSettingRepo::bulk_upsert(&state.pool, project_id, &body.settings).await?;
    Ok(Json(DataResponse { data: results }))
}

/// PUT /api/v1/projects/{project_id}/scene-settings/{scene_type_id}
///
/// Toggle a single scene setting for a project (scene_type level, no track).
pub async fn toggle_single(
    State(state): State<AppState>,
    Path((project_id, scene_type_id)): Path<(DbId, DbId)>,
    Json(body): Json<ToggleSettingBody>,
) -> AppResult<impl IntoResponse> {
    let setting = ProjectSceneSettingRepo::upsert(
        &state.pool,
        project_id,
        scene_type_id,
        None,
        body.is_enabled,
    )
    .await?;
    Ok(Json(DataResponse { data: setting }))
}

/// PUT /api/v1/projects/{project_id}/scene-settings/{scene_type_id}/tracks/{track_id}
///
/// Toggle a single scene setting for a specific track within a scene type.
pub async fn toggle_single_track(
    State(state): State<AppState>,
    Path((project_id, scene_type_id, track_id)): Path<(DbId, DbId, DbId)>,
    Json(body): Json<ToggleSettingBody>,
) -> AppResult<impl IntoResponse> {
    let setting = ProjectSceneSettingRepo::upsert(
        &state.pool,
        project_id,
        scene_type_id,
        Some(track_id),
        body.is_enabled,
    )
    .await?;
    Ok(Json(DataResponse { data: setting }))
}
