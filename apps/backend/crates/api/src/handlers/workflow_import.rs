//! Handlers for ComfyUI Workflow Import & Validation (PRD-75).
//!
//! Provides endpoints for importing, listing, updating, validating,
//! and versioning ComfyUI workflow definitions.

use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;

use serde::Deserialize;

use trulience_core::error::CoreError;
use trulience_core::search::{clamp_limit, clamp_offset, DEFAULT_SEARCH_LIMIT, MAX_SEARCH_LIMIT};
use trulience_core::types::DbId;
use trulience_core::workflow_import::{
    self, WORKFLOW_STATUS_ID_VALIDATED,
};
use trulience_db::models::workflow::{CreateWorkflow, ImportWorkflowRequest, UpdateWorkflow, Workflow};
use trulience_db::models::workflow_version::{CreateWorkflowVersion, WorkflowDiffResponse};
use trulience_db::repositories::WorkflowRepo;
use trulience_db::repositories::WorkflowVersionRepo;

use crate::error::{AppError, AppResult};
use crate::middleware::auth::AuthUser;
use crate::response::DataResponse;
use crate::state::AppState;

// ---------------------------------------------------------------------------
// Query parameters
// ---------------------------------------------------------------------------

/// Query parameters for listing workflows.
#[derive(Debug, Deserialize)]
pub struct ListWorkflowsParams {
    pub status_id: Option<DbId>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

/// Query parameters for listing workflow versions.
#[derive(Debug, Deserialize)]
pub struct ListVersionsParams {
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

/// Query parameters for diffing two versions.
#[derive(Debug, Deserialize)]
pub struct DiffParams {
    pub v1: i32,
    pub v2: i32,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Verify that a workflow exists, returning the full row.
async fn ensure_workflow_exists(pool: &sqlx::PgPool, id: DbId) -> AppResult<Workflow> {
    WorkflowRepo::find_by_id(pool, id)
        .await?
        .ok_or_else(|| {
            AppError::Core(CoreError::NotFound {
                entity: "Workflow",
                id,
            })
        })
}

// ---------------------------------------------------------------------------
// POST /workflows/import
// ---------------------------------------------------------------------------

/// Import a new ComfyUI workflow.
///
/// Parses the JSON, validates the name and size, discovers parameters,
/// creates the workflow record and version 1, and returns the workflow.
pub async fn import_workflow(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(body): Json<ImportWorkflowRequest>,
) -> AppResult<impl IntoResponse> {
    // Validate name.
    workflow_import::validate_workflow_name(&body.name)?;

    // Validate JSON size.
    workflow_import::validate_workflow_json_size(&body.json_content)?;

    // Parse the workflow to validate structure.
    let parsed = workflow_import::parse_workflow(&body.json_content)?;

    // Discover configurable parameters.
    let discovered = workflow_import::discover_parameters(&parsed);
    let discovered_json = serde_json::to_value(&discovered).ok();

    // Create the workflow record.
    let create_input = CreateWorkflow {
        name: body.name.clone(),
        description: body.description.clone(),
        json_content: body.json_content.clone(),
        discovered_params_json: discovered_json.clone(),
        imported_from: Some("comfyui_json".to_string()),
        imported_by: Some(auth.user_id),
    };

    let workflow = WorkflowRepo::create(&state.pool, &create_input).await?;

    // Create version 1.
    let version_input = CreateWorkflowVersion {
        workflow_id: workflow.id,
        json_content: body.json_content,
        discovered_params_json: discovered_json,
        change_summary: Some("Initial import".to_string()),
        created_by: Some(auth.user_id),
    };

    WorkflowVersionRepo::create(&state.pool, &version_input).await?;

    tracing::info!(
        workflow_id = workflow.id,
        name = %body.name,
        user_id = auth.user_id,
        nodes = parsed.nodes.len(),
        models = parsed.referenced_models.len(),
        "Workflow imported"
    );

    Ok((StatusCode::CREATED, Json(DataResponse { data: workflow })))
}

// ---------------------------------------------------------------------------
// GET /workflows
// ---------------------------------------------------------------------------

/// List workflows with optional status filter and pagination.
pub async fn list_workflows(
    State(state): State<AppState>,
    Query(params): Query<ListWorkflowsParams>,
) -> AppResult<impl IntoResponse> {
    let limit = clamp_limit(params.limit, DEFAULT_SEARCH_LIMIT, MAX_SEARCH_LIMIT);
    let offset = clamp_offset(params.offset);

    let items = WorkflowRepo::list(&state.pool, params.status_id, limit, offset).await?;

    tracing::debug!(count = items.len(), "Listed workflows");

    Ok(Json(DataResponse { data: items }))
}

// ---------------------------------------------------------------------------
// GET /workflows/{id}
// ---------------------------------------------------------------------------

/// Get a single workflow by ID.
pub async fn get_workflow(
    State(state): State<AppState>,
    Path(id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let workflow = ensure_workflow_exists(&state.pool, id).await?;
    Ok(Json(DataResponse { data: workflow }))
}

// ---------------------------------------------------------------------------
// PUT /workflows/{id}
// ---------------------------------------------------------------------------

/// Update a workflow and create a new version if JSON content changes.
pub async fn update_workflow(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<DbId>,
    Json(body): Json<UpdateWorkflow>,
) -> AppResult<impl IntoResponse> {
    let _existing = ensure_workflow_exists(&state.pool, id).await?;

    // If name is being updated, validate it.
    if let Some(ref name) = body.name {
        workflow_import::validate_workflow_name(name)?;
    }

    // If JSON content is changing, validate and create a new version.
    if let Some(ref json_content) = body.json_content {
        workflow_import::validate_workflow_json_size(json_content)?;
        let parsed = workflow_import::parse_workflow(json_content)?;
        let discovered = workflow_import::discover_parameters(&parsed);
        let discovered_json = serde_json::to_value(&discovered).ok();

        let version_input = CreateWorkflowVersion {
            workflow_id: id,
            json_content: json_content.clone(),
            discovered_params_json: discovered_json,
            change_summary: Some("Workflow updated".to_string()),
            created_by: Some(auth.user_id),
        };

        let new_version = WorkflowVersionRepo::create(&state.pool, &version_input).await?;

        // Update the current_version on the workflow.
        sqlx::query(
            "UPDATE workflows SET current_version = $1 WHERE id = $2",
        )
        .bind(new_version.version)
        .bind(id)
        .execute(&state.pool)
        .await?;
    }

    let updated = WorkflowRepo::update(&state.pool, id, &body)
        .await?
        .ok_or_else(|| {
            AppError::Core(CoreError::NotFound {
                entity: "Workflow",
                id,
            })
        })?;

    tracing::info!(workflow_id = id, user_id = auth.user_id, "Workflow updated");

    Ok(Json(DataResponse { data: updated }))
}

// ---------------------------------------------------------------------------
// DELETE /workflows/{id}
// ---------------------------------------------------------------------------

/// Delete a workflow by ID.
pub async fn delete_workflow(
    State(state): State<AppState>,
    _auth: AuthUser,
    Path(id): Path<DbId>,
) -> AppResult<StatusCode> {
    let deleted = WorkflowRepo::delete(&state.pool, id).await?;
    if deleted {
        tracing::info!(id, "Workflow deleted");
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(AppError::Core(CoreError::NotFound {
            entity: "Workflow",
            id,
        }))
    }
}

// ---------------------------------------------------------------------------
// POST /workflows/{id}/validate
// ---------------------------------------------------------------------------

/// Run node and model validation on a workflow.
///
/// Checks that all node class types and referenced models are known.
/// Stores validation results on the workflow record.
pub async fn validate_workflow(
    State(state): State<AppState>,
    Path(id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let workflow = ensure_workflow_exists(&state.pool, id).await?;

    let parsed = workflow_import::parse_workflow(&workflow.json_content)?;

    // Build validation results.
    // In a production system, this would check against actual worker
    // capabilities. For now, we mark standard nodes as present and
    // models as found_in_registry = false (requires worker verification).
    let node_results: Vec<workflow_import::NodeValidationResult> = {
        let mut seen = Vec::new();
        let mut results = Vec::new();
        for node in &parsed.nodes {
            if !seen.contains(&node.class_type) {
                seen.push(node.class_type.clone());
                results.push(workflow_import::NodeValidationResult {
                    node_type: node.class_type.clone(),
                    present: !parsed.referenced_custom_nodes.contains(&node.class_type),
                });
            }
        }
        results
    };

    let model_results: Vec<workflow_import::ModelValidationResult> = parsed
        .referenced_models
        .iter()
        .chain(parsed.referenced_loras.iter())
        .map(|name| workflow_import::ModelValidationResult {
            model_name: name.clone(),
            found_in_registry: false, // Requires worker verification.
        })
        .collect();

    let all_nodes_valid = node_results.iter().all(|r| r.present);
    let overall_valid = all_nodes_valid; // Models require worker check.

    let validation = workflow_import::ValidationResult {
        node_results,
        model_results,
        overall_valid,
    };

    let validation_json = serde_json::to_value(&validation).map_err(|e| {
        AppError::InternalError(format!("Failed to serialize validation results: {e}"))
    })?;

    WorkflowRepo::update_validation(&state.pool, id, &validation_json).await?;

    // If all nodes are valid, upgrade status to validated.
    if overall_valid {
        WorkflowRepo::update_status(&state.pool, id, WORKFLOW_STATUS_ID_VALIDATED).await?;
    }

    tracing::info!(
        workflow_id = id,
        overall_valid,
        "Workflow validated"
    );

    Ok(Json(DataResponse { data: validation }))
}

// ---------------------------------------------------------------------------
// GET /workflows/{id}/validation-report
// ---------------------------------------------------------------------------

/// Return the latest validation results for a workflow.
pub async fn get_validation_report(
    State(state): State<AppState>,
    Path(id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let workflow = ensure_workflow_exists(&state.pool, id).await?;

    let results = workflow.validation_results_json.unwrap_or(serde_json::json!(null));
    Ok(Json(DataResponse { data: results }))
}

// ---------------------------------------------------------------------------
// GET /workflows/{id}/versions
// ---------------------------------------------------------------------------

/// List versions for a workflow, newest first.
pub async fn list_versions(
    State(state): State<AppState>,
    Path(workflow_id): Path<DbId>,
    Query(params): Query<ListVersionsParams>,
) -> AppResult<impl IntoResponse> {
    let _workflow = ensure_workflow_exists(&state.pool, workflow_id).await?;

    let limit = clamp_limit(params.limit, DEFAULT_SEARCH_LIMIT, MAX_SEARCH_LIMIT);
    let offset = clamp_offset(params.offset);

    let versions = WorkflowVersionRepo::list_for_workflow(
        &state.pool,
        workflow_id,
        limit,
        offset,
    )
    .await?;

    Ok(Json(DataResponse { data: versions }))
}

// ---------------------------------------------------------------------------
// GET /workflows/{id}/versions/{version}
// ---------------------------------------------------------------------------

/// Get a specific version of a workflow.
pub async fn get_version(
    State(state): State<AppState>,
    Path((workflow_id, version)): Path<(DbId, i32)>,
) -> AppResult<impl IntoResponse> {
    let _workflow = ensure_workflow_exists(&state.pool, workflow_id).await?;

    let ver = WorkflowVersionRepo::find_by_version(&state.pool, workflow_id, version)
        .await?
        .ok_or_else(|| {
            AppError::BadRequest(format!(
                "Version {version} not found for workflow {workflow_id}"
            ))
        })?;

    Ok(Json(DataResponse { data: ver }))
}

// ---------------------------------------------------------------------------
// GET /workflows/{id}/diff?v1=X&v2=Y
// ---------------------------------------------------------------------------

/// Diff two versions of a workflow.
///
/// Returns the change summaries and a list of JSON keys that differ.
pub async fn diff_versions(
    State(state): State<AppState>,
    Path(workflow_id): Path<DbId>,
    Query(params): Query<DiffParams>,
) -> AppResult<impl IntoResponse> {
    let _workflow = ensure_workflow_exists(&state.pool, workflow_id).await?;

    let ver_a = WorkflowVersionRepo::find_by_version(&state.pool, workflow_id, params.v1)
        .await?
        .ok_or_else(|| {
            AppError::BadRequest(format!(
                "Version {} not found for workflow {workflow_id}",
                params.v1
            ))
        })?;

    let ver_b = WorkflowVersionRepo::find_by_version(&state.pool, workflow_id, params.v2)
        .await?
        .ok_or_else(|| {
            AppError::BadRequest(format!(
                "Version {} not found for workflow {workflow_id}",
                params.v2
            ))
        })?;

    // Compute a simplified diff: list top-level keys that differ.
    let keys_changed = compute_json_diff(&ver_a.json_content, &ver_b.json_content);

    let diff = WorkflowDiffResponse {
        workflow_id,
        version_a: params.v1,
        version_b: params.v2,
        change_summary_a: ver_a.change_summary,
        change_summary_b: ver_b.change_summary,
        keys_changed,
    };

    Ok(Json(DataResponse { data: diff }))
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/// Compute a simplified diff between two JSON objects.
///
/// Returns a list of top-level keys that are present in one but not the
/// other, or that have different values.
fn compute_json_diff(a: &serde_json::Value, b: &serde_json::Value) -> Vec<String> {
    let mut changed = Vec::new();

    if let (Some(obj_a), Some(obj_b)) = (a.as_object(), b.as_object()) {
        // Keys in A but not B, or with different values.
        for (key, val_a) in obj_a {
            match obj_b.get(key) {
                Some(val_b) if val_a != val_b => changed.push(key.clone()),
                None => changed.push(key.clone()),
                _ => {}
            }
        }
        // Keys in B but not A.
        for key in obj_b.keys() {
            if !obj_a.contains_key(key) && !changed.contains(key) {
                changed.push(key.clone());
            }
        }
    }

    changed
}
