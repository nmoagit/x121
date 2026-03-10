//! Orphan cleanup endpoint (Task 1.5).

use axum::extract::State;
use axum::Json;
use serde::{Deserialize, Serialize};
use x121_core::types::DbId;
use x121_db::models::cloud_provider::CreateCloudInstance;
use x121_db::repositories::{CloudInstanceRepo, ComfyUIInstanceRepo};

use x121_core::activity::ActivityLogLevel;

use crate::error::{AppError, AppResult};
use crate::middleware::rbac::RequireAdmin;
use crate::response::DataResponse;
use crate::state::AppState;

use super::{emit_infra_fields, load_cloud_instance, resolve_provider};

/* --------------------------------------------------------------------------
Types
-------------------------------------------------------------------------- */

#[derive(Debug, Deserialize)]
pub struct OrphanCleanupRequest {
    #[serde(default)]
    pub cloud_orphans: Vec<CloudOrphanAction>,
    #[serde(default)]
    pub db_orphans: Vec<DbOrphanAction>,
    #[serde(default)]
    pub comfyui_orphans: Vec<i64>,
}

#[derive(Debug, Deserialize)]
pub struct CloudOrphanAction {
    pub external_id: String,
    pub provider_id: i64,
    pub action: String,
}

#[derive(Debug, Deserialize)]
pub struct DbOrphanAction {
    pub instance_id: i64,
    pub action: String,
}

#[derive(Serialize)]
pub struct CleanupSummary {
    pub cloud_imported: u32,
    pub cloud_terminated: u32,
    pub db_removed: u32,
    pub db_resynced: u32,
    pub comfyui_disabled: u32,
    pub errors: Vec<String>,
}

/* --------------------------------------------------------------------------
Handler
-------------------------------------------------------------------------- */

/// POST /admin/infrastructure/cleanup-orphans
///
/// Processes orphan cleanup actions returned by `scan_orphans`.
pub async fn cleanup_orphans(
    RequireAdmin(_admin): RequireAdmin,
    State(state): State<AppState>,
    Json(body): Json<OrphanCleanupRequest>,
) -> AppResult<Json<DataResponse<CleanupSummary>>> {
    let mut summary = CleanupSummary {
        cloud_imported: 0,
        cloud_terminated: 0,
        db_removed: 0,
        db_resynced: 0,
        comfyui_disabled: 0,
        errors: Vec::new(),
    };

    let total_orphans =
        body.cloud_orphans.len() + body.db_orphans.len() + body.comfyui_orphans.len();
    emit_infra_fields(
        &state,
        ActivityLogLevel::Warn,
        format!("Orphan cleanup started ({total_orphans} items)"),
        serde_json::json!({
            "cloud_orphans": body.cloud_orphans.len(),
            "db_orphans": body.db_orphans.len(),
            "comfyui_orphans": body.comfyui_orphans.len(),
        }),
    );

    for orphan in &body.cloud_orphans {
        match orphan.action.as_str() {
            "import" => match handle_cloud_import(&state, orphan).await {
                Ok(()) => summary.cloud_imported += 1,
                Err(e) => summary
                    .errors
                    .push(format!("import {}: {e}", orphan.external_id)),
            },
            "terminate" => match handle_cloud_terminate(&state, orphan).await {
                Ok(()) => summary.cloud_terminated += 1,
                Err(e) => summary
                    .errors
                    .push(format!("terminate {}: {e}", orphan.external_id)),
            },
            other => {
                summary.errors.push(format!(
                    "unknown cloud action '{}' for {}",
                    other, orphan.external_id
                ));
            }
        }
    }

    for orphan in &body.db_orphans {
        match orphan.action.as_str() {
            "remove" => match CloudInstanceRepo::delete(&state.pool, orphan.instance_id).await {
                Ok(true) => summary.db_removed += 1,
                Ok(false) => summary
                    .errors
                    .push(format!("remove instance {}: not found", orphan.instance_id)),
                Err(e) => summary
                    .errors
                    .push(format!("remove instance {}: {e}", orphan.instance_id)),
            },
            "resync" => match handle_db_resync(&state, orphan.instance_id).await {
                Ok(()) => summary.db_resynced += 1,
                Err(e) => summary
                    .errors
                    .push(format!("resync instance {}: {e}", orphan.instance_id)),
            },
            other => {
                summary.errors.push(format!(
                    "unknown db action '{}' for instance {}",
                    other, orphan.instance_id
                ));
            }
        }
    }

    for &comfyui_id in &body.comfyui_orphans {
        match ComfyUIInstanceRepo::disable_by_id(&state.pool, comfyui_id).await {
            Ok(_) => summary.comfyui_disabled += 1,
            Err(e) => summary
                .errors
                .push(format!("disable comfyui {comfyui_id}: {e}")),
        }
    }

    Ok(Json(DataResponse { data: summary }))
}

/* --------------------------------------------------------------------------
Helpers
-------------------------------------------------------------------------- */

/// Import a cloud orphan by creating a tracking row in `cloud_instances`.
async fn handle_cloud_import(state: &AppState, orphan: &CloudOrphanAction) -> Result<(), AppError> {
    let input = CreateCloudInstance {
        gpu_type_id: 0,
        external_id: orphan.external_id.clone(),
        name: Some(format!("imported-{}", &orphan.external_id)),
        gpu_count: None,
        cost_per_hour_cents: 0,
        metadata: None,
    };
    CloudInstanceRepo::create(&state.pool, orphan.provider_id, &input).await?;
    Ok(())
}

/// Terminate a cloud orphan at the provider.
async fn handle_cloud_terminate(
    state: &AppState,
    orphan: &CloudOrphanAction,
) -> Result<(), AppError> {
    let provider = resolve_provider(state, orphan.provider_id).await?;
    provider.terminate_instance(&orphan.external_id).await?;
    Ok(())
}

/// Re-sync a DB orphan by querying the provider for actual status and updating the row.
async fn handle_db_resync(state: &AppState, instance_id: DbId) -> Result<(), AppError> {
    let inst = load_cloud_instance(&state.pool, instance_id).await?;
    let provider = resolve_provider(state, inst.provider_id).await?;
    let actual = provider.get_instance_status(&inst.external_id).await?;
    let new_status_id = actual.to_db_status_id();
    CloudInstanceRepo::update_status(&state.pool, instance_id, new_status_id).await?;
    Ok(())
}
