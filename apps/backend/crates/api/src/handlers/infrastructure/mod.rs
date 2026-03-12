//! API handlers for generation infrastructure management.
//!
//! Provides admin endpoints to manage RunPod pods, ComfyUI instances,
//! and the generation event loop from within the application.

mod bulk_ops;
mod instance_ops;
mod orphan_cleanup;
mod orphan_scan;

pub use bulk_ops::{bulk_start, bulk_stop, bulk_terminate};
pub use instance_ops::{force_reconnect_instance, reset_state, restart_comfyui};
pub use orphan_cleanup::cleanup_orphans;
pub use orphan_scan::scan_orphans;

use std::sync::Arc;

use axum::extract::State;
use axum::Json;
use serde::{Deserialize, Serialize};
use x121_cloud::runpod::orchestrator::PodOrchestrator;
use x121_core::cloud::CloudGpuProvider;
use x121_core::error::CoreError;
use x121_core::types::DbId;
use x121_db::repositories::{CloudInstanceRepo, CloudProviderRepo, ComfyUIInstanceRepo};

use x121_core::activity::{ActivityLogEntry, ActivityLogLevel, ActivityLogSource};

use crate::error::{AppError, AppResult};
use crate::middleware::rbac::RequireAdmin;
use crate::response::DataResponse;
use crate::state::AppState;

/* --------------------------------------------------------------------------
Types
-------------------------------------------------------------------------- */

#[derive(Serialize)]
pub struct InfrastructureStatus {
    pub runpod_configured: bool,
    pub comfyui_instances: Vec<ComfyUIInstanceInfo>,
    pub connected_count: usize,
}

#[derive(Serialize)]
pub struct ComfyUIInstanceInfo {
    pub id: i64,
    pub name: String,
    pub api_url: String,
    pub ws_url: String,
    pub is_enabled: bool,
    pub last_connected_at: Option<chrono::DateTime<chrono::Utc>>,
    pub last_disconnected_at: Option<chrono::DateTime<chrono::Utc>>,
    /// Links this ComfyUI instance to the cloud instance that provisioned it.
    pub cloud_instance_id: Option<i64>,
}

#[derive(Serialize)]
pub struct PodStartResult {
    pub pod_id: String,
    pub comfyui_api_url: String,
    pub comfyui_ws_url: String,
    pub instance_registered: bool,
    pub manager_refreshed: bool,
}

#[derive(Serialize)]
pub struct PodStopResult {
    pub pod_id: String,
    pub terminated: bool,
    pub instances_disabled: u64,
}

#[derive(Serialize)]
pub struct RefreshResult {
    pub connected_count: usize,
}

#[derive(Deserialize)]
pub struct PodStopRequest {
    /// If provided, stop this specific pod. Otherwise, stop the most recent runpod-* pod.
    pub pod_id: Option<String>,
}

/// Result of an orphan scan across all cloud providers.
#[derive(Serialize)]
pub struct OrphanScanResult {
    /// Instances at the provider that have no corresponding `cloud_instances` row.
    pub cloud_orphans: Vec<CloudOrphan>,
    /// DB rows marked as running/starting but the provider reports them as terminated or not found.
    pub db_orphans: Vec<DbOrphan>,
    /// ComfyUI instances linked to cloud instances that no longer exist.
    pub comfyui_orphans: Vec<ComfyuiOrphan>,
}

/// A provider-side instance with no matching DB record.
#[derive(Serialize)]
pub struct CloudOrphan {
    pub external_id: String,
    pub name: Option<String>,
    pub provider_id: i64,
    pub provider_name: String,
    pub status: String,
    pub cost_per_hour_cents: Option<i64>,
}

/// A DB cloud_instance row whose provider-side state contradicts the DB.
#[derive(Serialize)]
pub struct DbOrphan {
    pub instance_id: i64,
    pub external_id: String,
    pub db_status: String,
    pub actual_status: String,
    pub provider_id: i64,
}

/// A ComfyUI instance linked to a non-existent or terminated cloud instance.
#[derive(Serialize)]
pub struct ComfyuiOrphan {
    pub comfyui_instance_id: i64,
    pub name: String,
    pub cloud_instance_id: Option<i64>,
    pub reason: String,
}

/* --------------------------------------------------------------------------
Shared helpers
-------------------------------------------------------------------------- */

/// Resolve a cloud instance by ID, returning an error if not found.
async fn load_cloud_instance(
    pool: &sqlx::PgPool,
    id: DbId,
) -> AppResult<x121_db::models::cloud_provider::CloudInstance> {
    CloudInstanceRepo::find_by_id(pool, id)
        .await?
        .ok_or_else(|| {
            AppError::Core(CoreError::NotFound {
                entity: "CloudInstance",
                id,
            })
        })
}

/// Resolve the provider implementation from the registry.
async fn resolve_provider(
    state: &AppState,
    provider_id: DbId,
) -> AppResult<Arc<dyn CloudGpuProvider>> {
    state.cloud_registry.get(provider_id).await.ok_or_else(|| {
        AppError::Core(CoreError::NotFound {
            entity: "CloudProvider (runtime)",
            id: provider_id,
        })
    })
}

/// Publish a curated infrastructure activity log entry.
fn emit_infra(state: &AppState, level: ActivityLogLevel, message: impl Into<String>) {
    state
        .activity_broadcaster
        .publish(ActivityLogEntry::curated(
            level,
            ActivityLogSource::Infrastructure,
            message,
        ));
}

/// Publish a curated infrastructure activity log entry with structured fields.
fn emit_infra_fields(
    state: &AppState,
    level: ActivityLogLevel,
    message: impl Into<String>,
    fields: serde_json::Value,
) {
    state.activity_broadcaster.publish(
        ActivityLogEntry::curated(level, ActivityLogSource::Infrastructure, message)
            .with_fields(fields),
    );
}

/// Map a cloud instance status_id to a human-readable name.
fn cloud_instance_status_name(status_id: i16) -> String {
    match status_id {
        1 => "provisioning",
        2 => "starting",
        3 => "running",
        4 => "stopping",
        5 => "stopped",
        6 => "terminating",
        7 => "terminated",
        8 => "error",
        _ => "unknown",
    }
    .to_string()
}

/* --------------------------------------------------------------------------
Handlers
-------------------------------------------------------------------------- */

/// GET /admin/infrastructure/status
pub async fn get_status(
    RequireAdmin(_admin): RequireAdmin,
    State(state): State<AppState>,
) -> Result<Json<DataResponse<InfrastructureStatus>>, AppError> {
    let instances = ComfyUIInstanceRepo::list(&state.pool)
        .await
        .unwrap_or_default();

    let connected_ids = state.comfyui_manager.connected_instance_ids().await;

    let instance_infos: Vec<ComfyUIInstanceInfo> = instances
        .into_iter()
        .map(|i| ComfyUIInstanceInfo {
            id: i.id,
            name: i.name,
            api_url: i.api_url,
            ws_url: i.ws_url,
            is_enabled: i.is_enabled,
            last_connected_at: i.last_connected_at,
            last_disconnected_at: i.last_disconnected_at,
            cloud_instance_id: i.cloud_instance_id,
        })
        .collect();

    let status = InfrastructureStatus {
        runpod_configured: state.pod_orchestrator.is_some(),
        comfyui_instances: instance_infos,
        connected_count: connected_ids.len(),
    };

    Ok(Json(DataResponse { data: status }))
}

/// POST /admin/infrastructure/pod/start
///
/// Starts a RunPod pod and registers the ComfyUI instance. Prefers the
/// lifecycle bridge path (DB-based provider) but falls back to the legacy
/// env-based `PodOrchestrator` when no RunPod provider exists in the DB.
pub async fn start_pod(
    RequireAdmin(_admin): RequireAdmin,
    State(state): State<AppState>,
) -> Result<Json<DataResponse<PodStartResult>>, AppError> {
    // Try the lifecycle bridge path first: look for a RunPod provider in DB.
    let runpod_providers = CloudProviderRepo::find_by_type(&state.pool, "runpod").await?;

    if let Some(provider) = runpod_providers.first() {
        let provider_id = provider.id;
        let orch = state
            .lifecycle_bridge
            .build_orchestrator(provider_id)
            .await?;

        // Find or create a cloud_instance row to track this pod.
        // Use the first active instance, or create a placeholder if none exist.
        let cloud_instance_id =
            match CloudInstanceRepo::list_active_by_provider(&state.pool, provider_id)
                .await?
                .first()
            {
                Some(inst) => inst.id,
                None => {
                    // No tracked instance — fall through to legacy path.
                    return start_pod_legacy(&state).await;
                }
            };

        let external_id = CloudInstanceRepo::find_by_id(&state.pool, cloud_instance_id)
            .await?
            .map(|i| i.external_id)
            .unwrap_or_default();

        let ready = state
            .lifecycle_bridge
            .startup(cloud_instance_id, &orch, &external_id)
            .await?;

        tokio::time::sleep(std::time::Duration::from_secs(2)).await;
        let connected = state.comfyui_manager.connected_instance_ids().await;

        let result = PodStartResult {
            pod_id: ready.pod_id,
            comfyui_api_url: ready.comfyui_api_url,
            comfyui_ws_url: ready.comfyui_ws_url,
            instance_registered: true,
            manager_refreshed: !connected.is_empty(),
        };

        return Ok(Json(DataResponse { data: result }));
    }

    // No RunPod provider in DB — fall back to legacy env-based path.
    start_pod_legacy(&state).await
}

/// Legacy start_pod implementation using the env-based `PodOrchestrator`.
async fn start_pod_legacy(
    state: &AppState,
) -> Result<Json<DataResponse<PodStartResult>>, AppError> {
    let orchestrator = state
        .pod_orchestrator
        .as_ref()
        .ok_or_else(|| AppError::BadRequest("RunPod is not configured".into()))?;

    let ready = orchestrator.ensure_ready(&state.pool).await?;

    // Disable stale runpod-* instances.
    let _ = ComfyUIInstanceRepo::disable_by_name_prefix(&state.pool, "runpod-").await;

    // Register the new pod's ComfyUI endpoints.
    let instance_name = PodOrchestrator::instance_name(&ready.pod_id);
    let instance_registered = match ComfyUIInstanceRepo::upsert_by_name(
        &state.pool,
        &instance_name,
        &ready.comfyui_ws_url,
        &ready.comfyui_api_url,
    )
    .await
    {
        Ok(_) => true,
        Err(e) => {
            tracing::error!(error = %e, name = %instance_name, "Failed to register ComfyUI instance");
            false
        }
    };

    // Refresh the manager to pick up the new instance.
    state.comfyui_manager.refresh_instances().await;
    tokio::time::sleep(std::time::Duration::from_secs(2)).await;

    let connected = state.comfyui_manager.connected_instance_ids().await;

    let result = PodStartResult {
        pod_id: ready.pod_id,
        comfyui_api_url: ready.comfyui_api_url,
        comfyui_ws_url: ready.comfyui_ws_url,
        instance_registered,
        manager_refreshed: !connected.is_empty(),
    };

    Ok(Json(DataResponse { data: result }))
}

/// POST /admin/infrastructure/pod/stop
///
/// Stops a RunPod pod. Prefers the lifecycle bridge (teardown handles ComfyUI
/// disconnection) but falls back to the legacy env-based orchestrator.
pub async fn stop_pod(
    RequireAdmin(_admin): RequireAdmin,
    State(state): State<AppState>,
    Json(body): Json<PodStopRequest>,
) -> Result<Json<DataResponse<PodStopResult>>, AppError> {
    emit_infra(
        &state,
        ActivityLogLevel::Info,
        "Instance stop/terminate requested",
    );

    // Resolve pod ID from request body or from DB.
    let pod_id = if let Some(id) = body.pod_id {
        id
    } else {
        let instances = ComfyUIInstanceRepo::find_by_name_prefix(&state.pool, "runpod-").await?;

        instances
            .first()
            .and_then(|i| i.name.strip_prefix("runpod-").map(|s| s.to_string()))
            .ok_or_else(|| AppError::BadRequest("No RunPod instances found to stop".into()))?
    };

    // Try lifecycle bridge path: find the cloud instance for this pod.
    let runpod_providers = CloudProviderRepo::find_by_type(&state.pool, "runpod").await?;
    let mut used_bridge = false;

    if let Some(provider) = runpod_providers.first() {
        let provider_id = provider.id;
        // Look for a cloud instance with this external_id.
        if let Ok(Some(cloud_inst)) =
            CloudInstanceRepo::find_by_external_id(&state.pool, provider_id, &pod_id).await
        {
            match state.lifecycle_bridge.build_orchestrator(provider_id).await {
                Ok(orch) => {
                    if let Err(e) = state
                        .lifecycle_bridge
                        .teardown(cloud_inst.id, &orch, &pod_id, false)
                        .await
                    {
                        tracing::warn!(
                            cloud_instance_id = cloud_inst.id,
                            error = %e,
                            "Lifecycle teardown failed; falling back to legacy stop"
                        );
                    } else {
                        used_bridge = true;
                    }
                }
                Err(e) => {
                    tracing::warn!(
                        provider_id,
                        error = %e,
                        "Failed to build orchestrator for stop_pod teardown"
                    );
                }
            }
        }
    }

    // Legacy fallback: direct orchestrator stop + manual cleanup.
    if !used_bridge {
        let orchestrator = state
            .pod_orchestrator
            .as_ref()
            .ok_or_else(|| AppError::BadRequest("RunPod is not configured".into()))?;

        orchestrator.stop_or_terminate_pod(&pod_id).await?;
    }

    let disabled = ComfyUIInstanceRepo::disable_by_name_prefix(&state.pool, "runpod-")
        .await
        .unwrap_or(0);

    let result = PodStopResult {
        pod_id,
        terminated: true,
        instances_disabled: disabled,
    };

    Ok(Json(DataResponse { data: result }))
}

/// GET /admin/infrastructure/gpu-types
pub async fn list_gpu_types(
    RequireAdmin(_admin): RequireAdmin,
    State(state): State<AppState>,
) -> Result<Json<DataResponse<Vec<x121_core::cloud::GpuTypeInfo>>>, AppError> {
    let orchestrator = state
        .pod_orchestrator
        .as_ref()
        .ok_or_else(|| AppError::BadRequest("RunPod is not configured".into()))?;

    let gpu_types = orchestrator.list_gpu_types().await?;

    Ok(Json(DataResponse { data: gpu_types }))
}

/// POST /admin/infrastructure/comfyui/refresh
pub async fn refresh_instances(
    RequireAdmin(_admin): RequireAdmin,
    State(state): State<AppState>,
) -> Result<Json<DataResponse<RefreshResult>>, AppError> {
    state.comfyui_manager.refresh_instances().await;
    tokio::time::sleep(std::time::Duration::from_secs(2)).await;

    let connected = state.comfyui_manager.connected_instance_ids().await;

    Ok(Json(DataResponse {
        data: RefreshResult {
            connected_count: connected.len(),
        },
    }))
}
