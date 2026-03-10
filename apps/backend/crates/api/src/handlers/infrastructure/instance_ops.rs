//! Per-instance operation endpoints (Task 1.7).

use axum::extract::{Path, State};
use axum::Json;
use x121_core::types::DbId;
use x121_db::repositories::{CloudInstanceRepo, ComfyUIInstanceRepo};

use x121_core::activity::ActivityLogLevel;

use crate::error::{AppError, AppResult};
use crate::middleware::rbac::RequireAdmin;
use crate::response::DataResponse;
use crate::state::AppState;

use super::{cloud_instance_status_name, emit_infra_fields, load_cloud_instance, resolve_provider};

/// POST /admin/infrastructure/cloud-instances/:id/restart-comfyui
///
/// Restarts the ComfyUI process on the pod without terminating the instance.
pub async fn restart_comfyui(
    RequireAdmin(_admin): RequireAdmin,
    State(state): State<AppState>,
    Path(id): Path<DbId>,
) -> AppResult<Json<DataResponse<serde_json::Value>>> {
    let inst = load_cloud_instance(&state.pool, id).await?;

    emit_infra_fields(
        &state,
        ActivityLogLevel::Info,
        format!(
            "ComfyUI restart requested for instance {}",
            inst.external_id
        ),
        serde_json::json!({ "cloud_instance_id": id, "external_id": inst.external_id }),
    );

    let orch = state
        .lifecycle_bridge
        .build_orchestrator(inst.provider_id)
        .await?;

    let ready = orch.restart_comfyui(&inst.external_id).await?;

    // Refresh ComfyUI manager to pick up potentially new URLs.
    state.comfyui_manager.refresh_instances().await;

    Ok(Json(DataResponse {
        data: serde_json::json!({
            "instance_id": id,
            "pod_id": ready.pod_id,
            "comfyui_api_url": ready.comfyui_api_url,
            "comfyui_ws_url": ready.comfyui_ws_url,
        }),
    }))
}

/// POST /admin/infrastructure/cloud-instances/:id/force-reconnect
///
/// Forces the ComfyUI manager to reconnect to the instance linked to this cloud instance.
pub async fn force_reconnect_instance(
    RequireAdmin(_admin): RequireAdmin,
    State(state): State<AppState>,
    Path(id): Path<DbId>,
) -> AppResult<Json<DataResponse<serde_json::Value>>> {
    let comfyui = ComfyUIInstanceRepo::find_by_cloud_instance_id(&state.pool, id)
        .await?
        .ok_or_else(|| {
            AppError::BadRequest(format!("No ComfyUI instance linked to cloud instance {id}"))
        })?;

    emit_infra_fields(
        &state,
        ActivityLogLevel::Info,
        format!(
            "Force reconnect triggered for ComfyUI instance {}",
            comfyui.name
        ),
        serde_json::json!({
            "cloud_instance_id": id,
            "comfyui_instance_id": comfyui.id,
            "comfyui_name": comfyui.name,
        }),
    );

    state
        .comfyui_manager
        .force_reconnect(comfyui.id)
        .await
        .map_err(|e| AppError::InternalError(format!("force_reconnect failed: {e}")))?;

    Ok(Json(DataResponse {
        data: serde_json::json!({
            "instance_id": id,
            "comfyui_instance_id": comfyui.id,
            "reconnected": true,
        }),
    }))
}

/// POST /admin/infrastructure/cloud-instances/:id/reset-state
///
/// Queries the provider for actual instance status and updates the DB row.
pub async fn reset_state(
    RequireAdmin(_admin): RequireAdmin,
    State(state): State<AppState>,
    Path(id): Path<DbId>,
) -> AppResult<Json<DataResponse<serde_json::Value>>> {
    let inst = load_cloud_instance(&state.pool, id).await?;
    let provider = resolve_provider(&state, inst.provider_id).await?;

    let actual_status = provider.get_instance_status(&inst.external_id).await?;
    let new_status_id = actual_status.to_db_status_id();
    let old_status = cloud_instance_status_name(inst.status_id);

    CloudInstanceRepo::update_status(&state.pool, id, new_status_id).await?;

    emit_infra_fields(
        &state,
        ActivityLogLevel::Info,
        format!("Instance state corrected: {old_status} -> {actual_status:?}"),
        serde_json::json!({
            "instance_id": id,
            "external_id": inst.external_id,
            "old_status": old_status,
            "new_status": format!("{actual_status:?}"),
        }),
    );

    Ok(Json(DataResponse {
        data: serde_json::json!({
            "instance_id": id,
            "old_status": old_status,
            "new_status": format!("{actual_status:?}"),
            "status_id": new_status_id,
        }),
    }))
}
