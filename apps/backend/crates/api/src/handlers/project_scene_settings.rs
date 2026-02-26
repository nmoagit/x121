//! Handlers for per-project scene settings (PRD-111).
//!
//! Routes nested under `/projects/{project_id}/scene-settings`.

use axum::extract::{Path, State};
use axum::response::IntoResponse;
use axum::Json;
use x121_core::types::DbId;
use x121_db::models::project_scene_setting::{BulkProjectSceneSettings, ProjectSceneSettingUpdate};
use x121_db::repositories::ProjectSceneSettingRepo;

use crate::error::AppResult;
use crate::response::DataResponse;
use crate::state::AppState;

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/// GET /api/v1/projects/{project_id}/scene-settings
///
/// List effective scene settings for a project (catalog defaults + overrides).
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

/// PUT /api/v1/projects/{project_id}/scene-settings/{scene_catalog_id}
///
/// Toggle a single scene setting for a project.
pub async fn toggle_single(
    State(state): State<AppState>,
    Path((project_id, scene_catalog_id)): Path<(DbId, DbId)>,
    Json(body): Json<ProjectSceneSettingUpdate>,
) -> AppResult<impl IntoResponse> {
    let setting =
        ProjectSceneSettingRepo::upsert(&state.pool, project_id, scene_catalog_id, body.is_enabled)
            .await?;
    Ok(Json(DataResponse { data: setting }))
}
