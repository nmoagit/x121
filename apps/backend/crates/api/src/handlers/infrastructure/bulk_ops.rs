//! Bulk operation endpoints (Task 1.6).

use axum::extract::State;
use axum::Json;
use serde::{Deserialize, Serialize};
use x121_core::activity::ActivityLogLevel;
use x121_core::types::DbId;
use x121_db::repositories::CloudInstanceRepo;

use crate::error::{AppError, AppResult};
use crate::middleware::rbac::RequireAdmin;
use crate::response::DataResponse;
use crate::state::AppState;

use super::{emit_infra_fields, load_cloud_instance, resolve_provider};

/* --------------------------------------------------------------------------
Types
-------------------------------------------------------------------------- */

#[derive(Debug, Deserialize)]
pub struct BulkRequest {
    pub instance_ids: Vec<i64>,
    #[serde(default)]
    pub force: bool,
}

#[derive(Serialize)]
pub struct BulkResult {
    pub results: Vec<InstanceActionResult>,
}

#[derive(Serialize)]
pub struct InstanceActionResult {
    pub instance_id: i64,
    pub success: bool,
    pub error: Option<String>,
}

/* --------------------------------------------------------------------------
Handlers
-------------------------------------------------------------------------- */

/// POST /admin/infrastructure/bulk/start
pub async fn bulk_start(
    RequireAdmin(_admin): RequireAdmin,
    State(state): State<AppState>,
    Json(body): Json<BulkRequest>,
) -> AppResult<Json<DataResponse<BulkResult>>> {
    emit_infra_fields(
        &state,
        ActivityLogLevel::Info,
        format!(
            "Bulk start requested for {} instances",
            body.instance_ids.len()
        ),
        serde_json::json!({ "count": body.instance_ids.len(), "instance_ids": body.instance_ids }),
    );

    let futs = body.instance_ids.iter().map(|&id| {
        let state = state.clone();
        async move { action_result(id, start_one(&state, id).await) }
    });

    let results = futures::future::join_all(futs).await;
    Ok(Json(DataResponse {
        data: BulkResult { results },
    }))
}

/// POST /admin/infrastructure/bulk/stop
pub async fn bulk_stop(
    RequireAdmin(_admin): RequireAdmin,
    State(state): State<AppState>,
    Json(body): Json<BulkRequest>,
) -> AppResult<Json<DataResponse<BulkResult>>> {
    emit_infra_fields(
        &state,
        ActivityLogLevel::Info,
        format!(
            "Bulk stop requested for {} instances",
            body.instance_ids.len()
        ),
        serde_json::json!({
            "count": body.instance_ids.len(),
            "instance_ids": body.instance_ids,
            "force": body.force,
        }),
    );

    let force = body.force;
    let futs = body.instance_ids.iter().map(|&id| {
        let state = state.clone();
        async move { action_result(id, stop_one(&state, id, force).await) }
    });

    let results = futures::future::join_all(futs).await;
    Ok(Json(DataResponse {
        data: BulkResult { results },
    }))
}

/// POST /admin/infrastructure/bulk/terminate
pub async fn bulk_terminate(
    RequireAdmin(_admin): RequireAdmin,
    State(state): State<AppState>,
    Json(body): Json<BulkRequest>,
) -> AppResult<Json<DataResponse<BulkResult>>> {
    emit_infra_fields(
        &state,
        ActivityLogLevel::Warn,
        format!(
            "Bulk terminate requested for {} instances",
            body.instance_ids.len()
        ),
        serde_json::json!({ "count": body.instance_ids.len(), "instance_ids": body.instance_ids }),
    );

    let futs = body.instance_ids.iter().map(|&id| {
        let state = state.clone();
        async move { action_result(id, terminate_one(&state, id).await) }
    });

    let results = futures::future::join_all(futs).await;
    Ok(Json(DataResponse {
        data: BulkResult { results },
    }))
}

/* --------------------------------------------------------------------------
Per-instance helpers
-------------------------------------------------------------------------- */

/// Format result for a single instance action.
fn action_result(instance_id: i64, result: Result<(), AppError>) -> InstanceActionResult {
    match result {
        Ok(()) => InstanceActionResult {
            instance_id,
            success: true,
            error: None,
        },
        Err(e) => InstanceActionResult {
            instance_id,
            success: false,
            error: Some(e.to_string()),
        },
    }
}

/// Start a single cloud instance via the lifecycle bridge.
async fn start_one(state: &AppState, id: DbId) -> Result<(), AppError> {
    let inst = load_cloud_instance(&state.pool, id).await?;
    let orch = state
        .lifecycle_bridge
        .build_orchestrator(inst.provider_id)
        .await?;
    state
        .lifecycle_bridge
        .startup(id, &orch, &inst.external_id)
        .await?;
    Ok(())
}

/// Stop a single cloud instance via the lifecycle bridge.
async fn stop_one(state: &AppState, id: DbId, force: bool) -> Result<(), AppError> {
    let inst = load_cloud_instance(&state.pool, id).await?;
    let orch = state
        .lifecycle_bridge
        .build_orchestrator(inst.provider_id)
        .await?;

    if force {
        orch.terminate_pod(&inst.external_id).await?;
        CloudInstanceRepo::mark_terminated(&state.pool, id, inst.total_cost_cents).await?;
    } else {
        state
            .lifecycle_bridge
            .teardown(id, &orch, &inst.external_id)
            .await?;
    }
    Ok(())
}

/// Terminate a single cloud instance via the lifecycle bridge.
async fn terminate_one(state: &AppState, id: DbId) -> Result<(), AppError> {
    let inst = load_cloud_instance(&state.pool, id).await?;
    let orch = state
        .lifecycle_bridge
        .build_orchestrator(inst.provider_id)
        .await?;

    if let Err(e) = state
        .lifecycle_bridge
        .teardown(id, &orch, &inst.external_id)
        .await
    {
        tracing::warn!(
            cloud_instance_id = id,
            error = %e,
            "Lifecycle teardown failed during bulk terminate; proceeding with direct terminate"
        );
        let provider = resolve_provider(state, inst.provider_id).await?;
        provider.terminate_instance(&inst.external_id).await?;
    }

    CloudInstanceRepo::mark_terminated(&state.pool, id, inst.total_cost_cents).await?;
    Ok(())
}
