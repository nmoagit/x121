//! API handlers for generation infrastructure management.
//!
//! Provides admin endpoints to manage RunPod pods, ComfyUI instances,
//! and the generation event loop from within the application.

use axum::extract::State;
use axum::Json;
use serde::{Deserialize, Serialize};
use x121_cloud::runpod::orchestrator::PodOrchestrator;
use x121_db::repositories::{CloudInstanceRepo, CloudProviderRepo, ComfyUIInstanceRepo};

use crate::error::AppError;
use crate::middleware::rbac::RequireAdmin;
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

/* --------------------------------------------------------------------------
Handlers
-------------------------------------------------------------------------- */

/// GET /admin/infrastructure/status
pub async fn get_status(
    RequireAdmin(_admin): RequireAdmin,
    State(state): State<AppState>,
) -> Result<Json<serde_json::Value>, AppError> {
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

    Ok(Json(serde_json::json!({ "data": status })))
}

/// POST /admin/infrastructure/pod/start
///
/// Starts a RunPod pod and registers the ComfyUI instance. Prefers the
/// lifecycle bridge path (DB-based provider) but falls back to the legacy
/// env-based `PodOrchestrator` when no RunPod provider exists in the DB.
pub async fn start_pod(
    RequireAdmin(_admin): RequireAdmin,
    State(state): State<AppState>,
) -> Result<Json<serde_json::Value>, AppError> {
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

        return Ok(Json(serde_json::json!({ "data": result })));
    }

    // No RunPod provider in DB — fall back to legacy env-based path.
    start_pod_legacy(&state).await
}

/// Legacy start_pod implementation using the env-based `PodOrchestrator`.
async fn start_pod_legacy(state: &AppState) -> Result<Json<serde_json::Value>, AppError> {
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

    Ok(Json(serde_json::json!({ "data": result })))
}

/// POST /admin/infrastructure/pod/stop
///
/// Stops a RunPod pod. Prefers the lifecycle bridge (teardown handles ComfyUI
/// disconnection) but falls back to the legacy env-based orchestrator.
pub async fn stop_pod(
    RequireAdmin(_admin): RequireAdmin,
    State(state): State<AppState>,
    Json(body): Json<PodStopRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
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
                        .teardown(cloud_inst.id, &orch, &pod_id)
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

    Ok(Json(serde_json::json!({ "data": result })))
}

/// GET /admin/infrastructure/gpu-types
pub async fn list_gpu_types(
    RequireAdmin(_admin): RequireAdmin,
    State(state): State<AppState>,
) -> Result<Json<serde_json::Value>, AppError> {
    let orchestrator = state
        .pod_orchestrator
        .as_ref()
        .ok_or_else(|| AppError::BadRequest("RunPod is not configured".into()))?;

    let gpu_types = orchestrator.list_gpu_types().await?;

    Ok(Json(serde_json::json!({ "data": gpu_types })))
}

/// POST /admin/infrastructure/comfyui/refresh
pub async fn refresh_instances(
    RequireAdmin(_admin): RequireAdmin,
    State(state): State<AppState>,
) -> Result<Json<serde_json::Value>, AppError> {
    state.comfyui_manager.refresh_instances().await;
    tokio::time::sleep(std::time::Duration::from_secs(2)).await;

    let connected = state.comfyui_manager.connected_instance_ids().await;

    Ok(Json(serde_json::json!({
        "data": RefreshResult {
            connected_count: connected.len(),
        }
    })))
}
