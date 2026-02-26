//! Handlers for the node-based workflow canvas (PRD-33).
//!
//! Provides endpoints for canvas layout persistence, per-node timing
//! telemetry, and ComfyUI workflow JSON import.

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use serde::Deserialize;
use x121_core::error::CoreError;
use x121_core::types::DbId;
use x121_db::models::workflow_layout::CreateWorkflowLayout;
use x121_db::repositories::WorkflowLayoutRepo;

use crate::error::{AppError, AppResult};
use crate::middleware::rbac::RequireAuth;
use crate::response::DataResponse;
use crate::state::AppState;

// ---------------------------------------------------------------------------
// Canvas endpoints
// ---------------------------------------------------------------------------

/// GET /api/v1/workflows/:id/canvas
///
/// Retrieve the canvas layout for a workflow.
pub async fn get_canvas(
    RequireAuth(_user): RequireAuth,
    State(state): State<AppState>,
    Path(workflow_id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let layout = WorkflowLayoutRepo::find_by_workflow(&state.pool, workflow_id)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "WorkflowLayout",
            id: workflow_id,
        }))?;

    Ok(Json(DataResponse { data: layout }))
}

/// PUT /api/v1/workflows/:id/canvas
///
/// Save (upsert) the canvas layout for a workflow.
pub async fn save_canvas(
    RequireAuth(user): RequireAuth,
    State(state): State<AppState>,
    Path(workflow_id): Path<DbId>,
    Json(input): Json<CreateWorkflowLayout>,
) -> AppResult<impl IntoResponse> {
    let layout = WorkflowLayoutRepo::upsert(&state.pool, workflow_id, &input).await?;

    tracing::info!(
        workflow_id,
        layout_id = layout.id,
        user_id = user.user_id,
        "Workflow canvas layout saved",
    );

    Ok(Json(DataResponse { data: layout }))
}

// ---------------------------------------------------------------------------
// Telemetry endpoint
// ---------------------------------------------------------------------------

/// GET /api/v1/workflows/:id/telemetry
///
/// Return per-node timing telemetry for recent runs of a workflow.
///
/// This is a placeholder that returns an empty telemetry object.
/// Real data will be populated once the ComfyUI WebSocket bridge (PRD-05)
/// streams execution events into the telemetry store.
pub async fn get_telemetry(
    RequireAuth(_user): RequireAuth,
    Path(workflow_id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    // Placeholder: return empty telemetry keyed by workflow ID.
    let telemetry = serde_json::json!({
        "workflow_id": workflow_id,
        "nodes": {},
        "total_ms": null,
    });

    Ok(Json(DataResponse { data: telemetry }))
}

// ---------------------------------------------------------------------------
// ComfyUI import endpoint
// ---------------------------------------------------------------------------

/// Request body for ComfyUI workflow import.
#[derive(Debug, Deserialize)]
pub struct ImportComfyUIRequest {
    /// The raw ComfyUI workflow JSON object.
    pub workflow_json: serde_json::Value,
}

/// POST /api/v1/workflows/import-comfyui
///
/// Parse a ComfyUI workflow JSON and return the converted node/edge
/// representation. Does not persist; the client saves via `save_canvas`.
pub async fn import_comfyui(
    RequireAuth(user): RequireAuth,
    Json(input): Json<ImportComfyUIRequest>,
) -> AppResult<impl IntoResponse> {
    // Validate that the input is a JSON object.
    if !input.workflow_json.is_object() {
        return Err(AppError::Core(CoreError::Validation(
            "workflow_json must be a JSON object".to_string(),
        )));
    }

    let workflow_obj = input.workflow_json.as_object().unwrap();

    // Parse ComfyUI nodes from the workflow JSON.
    // ComfyUI workflows are objects where each key is a node ID and
    // the value contains class_type, inputs, and optional meta.
    let mut nodes = Vec::new();
    let mut edges = Vec::new();

    for (node_id, node_value) in workflow_obj {
        let class_type = node_value
            .get("class_type")
            .and_then(|v| v.as_str())
            .unwrap_or("unknown");

        let meta = node_value
            .get("_meta")
            .cloned()
            .unwrap_or(serde_json::json!({}));
        let title = meta
            .get("title")
            .and_then(|v| v.as_str())
            .unwrap_or(class_type);

        nodes.push(serde_json::json!({
            "id": node_id,
            "type": "comfyui",
            "data": {
                "label": title,
                "nodeType": class_type,
                "parameters": node_value.get("inputs").cloned().unwrap_or(serde_json::json!({})),
            },
            "position": { "x": 0, "y": 0 },
        }));

        // Extract edges from input connections.
        // In ComfyUI, an input value that is an array [source_node_id, output_index]
        // represents a connection from another node.
        if let Some(inputs) = node_value.get("inputs").and_then(|v| v.as_object()) {
            for (input_name, input_val) in inputs {
                if let Some(arr) = input_val.as_array() {
                    if arr.len() == 2 {
                        if let Some(source_id) =
                            arr[0].as_str().or_else(|| arr[0].as_u64().map(|_| ""))
                        {
                            let source_node_id = if source_id.is_empty() {
                                arr[0].to_string().trim_matches('"').to_string()
                            } else {
                                source_id.to_string()
                            };
                            let source_slot = arr[1].as_u64().unwrap_or(0);

                            edges.push(serde_json::json!({
                                "id": format!("{source_node_id}_{source_slot}_{node_id}_{input_name}"),
                                "source": source_node_id,
                                "sourceHandle": format!("output_{source_slot}"),
                                "target": node_id,
                                "targetHandle": input_name,
                            }));
                        }
                    }
                }
            }
        }
    }

    tracing::info!(
        user_id = user.user_id,
        node_count = nodes.len(),
        edge_count = edges.len(),
        "ComfyUI workflow imported",
    );

    Ok((
        StatusCode::OK,
        Json(DataResponse {
            data: serde_json::json!({
                "nodes": nodes,
                "edges": edges,
            }),
        }),
    ))
}
