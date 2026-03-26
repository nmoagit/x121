//! Handlers for per-project image settings (PRD-154).
//!
//! Routes nested under `/projects/{project_id}/image-settings`.

use axum::extract::{Path, State};
use axum::response::IntoResponse;
use axum::Json;
use x121_core::types::DbId;
use x121_db::models::project_image_setting::{BulkProjectImageSettings, ToggleImageSettingBody};
use x121_db::repositories::ProjectImageSettingRepo;

use crate::error::AppResult;
use crate::response::DataResponse;
use crate::state::AppState;

/// GET /api/v1/projects/{project_id}/image-settings
///
/// List effective image settings for a project (image_type defaults + overrides).
pub async fn list_effective(
    State(state): State<AppState>,
    Path(project_id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let settings = ProjectImageSettingRepo::list_effective(&state.pool, project_id).await?;
    Ok(Json(DataResponse { data: settings }))
}

/// PUT /api/v1/projects/{project_id}/image-settings
///
/// Bulk upsert project image settings.
pub async fn bulk_update(
    State(state): State<AppState>,
    Path(project_id): Path<DbId>,
    Json(body): Json<BulkProjectImageSettings>,
) -> AppResult<impl IntoResponse> {
    let results =
        ProjectImageSettingRepo::bulk_upsert(&state.pool, project_id, &body.settings).await?;
    Ok(Json(DataResponse { data: results }))
}

/// PUT /api/v1/projects/{project_id}/image-settings/{image_type_id}
///
/// Toggle a single image setting for a project (image_type level, no track).
pub async fn toggle_single(
    State(state): State<AppState>,
    Path((project_id, image_type_id)): Path<(DbId, DbId)>,
    Json(body): Json<ToggleImageSettingBody>,
) -> AppResult<impl IntoResponse> {
    let setting = ProjectImageSettingRepo::upsert(
        &state.pool,
        project_id,
        image_type_id,
        None,
        body.is_enabled,
    )
    .await?;
    Ok(Json(DataResponse { data: setting }))
}

/// PUT /api/v1/projects/{project_id}/image-settings/{image_type_id}/tracks/{track_id}
///
/// Toggle a single image setting for a specific track within an image type.
pub async fn toggle_single_track(
    State(state): State<AppState>,
    Path((project_id, image_type_id, track_id)): Path<(DbId, DbId, DbId)>,
    Json(body): Json<ToggleImageSettingBody>,
) -> AppResult<impl IntoResponse> {
    let setting = ProjectImageSettingRepo::upsert(
        &state.pool,
        project_id,
        image_type_id,
        Some(track_id),
        body.is_enabled,
    )
    .await?;
    Ok(Json(DataResponse { data: setting }))
}
