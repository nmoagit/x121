//! Handlers for Trigger Workflows (PRD-97).
//!
//! Admin endpoints for managing trigger rules, viewing execution logs,
//! performing dry-run simulations, and emergency pause/resume.

use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;

use serde::{Deserialize, Serialize};

use x121_core::error::CoreError;
use x121_core::search::MAX_SEARCH_LIMIT;
use x121_core::trigger_workflow::{
    self, DryRunResult, EvaluateTriggerInput, TriggerAction, TriggerCheckResult,
};
use x121_core::types::DbId;
use x121_db::models::trigger_workflow::{CreateTrigger, CreateTriggerLog, Trigger, UpdateTrigger};
use x121_db::repositories::trigger_workflow_repo::{TriggerLogRepo, TriggerRepo};

use crate::error::{AppError, AppResult};
use crate::middleware::rbac::RequireAdmin;
use crate::query::PaginationParams;
use crate::response::DataResponse;
use crate::state::AppState;

// ---------------------------------------------------------------------------
// Query / request types
// ---------------------------------------------------------------------------

/// Query parameters for listing triggers (extends PaginationParams with project_id).
#[derive(Debug, Deserialize)]
pub struct TriggerListQuery {
    pub project_id: Option<DbId>,
    #[serde(flatten)]
    pub pagination: PaginationParams,
}

/// Request body for dry-run simulation.
#[derive(Debug, Deserialize)]
pub struct DryRunRequest {
    pub event_data: Option<serde_json::Value>,
    pub chain_depth: Option<u32>,
}

/// Query parameters for chain graph.
#[derive(Debug, Deserialize)]
pub struct ChainGraphQuery {
    pub project_id: DbId,
}

/// Response for chain graph node.
#[derive(Debug, Serialize)]
pub struct ChainGraphNode {
    pub trigger_id: DbId,
    pub name: String,
    pub event_type: String,
    pub entity_type: String,
    pub actions: serde_json::Value,
    pub is_enabled: bool,
}

/// Response for pause/resume operations.
#[derive(Debug, Serialize)]
pub struct BulkToggleResponse {
    pub affected: u64,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Verify that a trigger exists, returning the full row.
async fn ensure_trigger_exists(pool: &sqlx::PgPool, id: DbId) -> AppResult<Trigger> {
    TriggerRepo::find_by_id(pool, id).await?.ok_or_else(|| {
        AppError::Core(CoreError::NotFound {
            entity: "Trigger",
            id,
        })
    })
}

/// Validate event_type and entity_type values.
fn validate_trigger_types(event_type: &str, entity_type: &str) -> AppResult<()> {
    if !trigger_workflow::is_valid_event_type(event_type) {
        return Err(AppError::Core(CoreError::Validation(format!(
            "Invalid event_type: '{event_type}'. Must be one of: {}",
            trigger_workflow::VALID_EVENT_TYPES.join(", ")
        ))));
    }
    if !trigger_workflow::is_valid_entity_type(entity_type) {
        return Err(AppError::Core(CoreError::Validation(format!(
            "Invalid entity_type: '{entity_type}'. Must be one of: {}",
            trigger_workflow::VALID_ENTITY_TYPES.join(", ")
        ))));
    }
    Ok(())
}

/// Validate execution_mode if provided.
fn validate_execution_mode(mode: &str) -> AppResult<()> {
    if !trigger_workflow::is_valid_execution_mode(mode) {
        return Err(AppError::Core(CoreError::Validation(format!(
            "Invalid execution_mode: '{mode}'. Must be one of: {}",
            trigger_workflow::VALID_EXECUTION_MODES.join(", ")
        ))));
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// GET /admin/triggers
// ---------------------------------------------------------------------------

/// List all triggers with optional project_id filter.
pub async fn list_triggers(
    State(state): State<AppState>,
    _admin: RequireAdmin,
    Query(query): Query<TriggerListQuery>,
) -> AppResult<impl IntoResponse> {
    let triggers =
        TriggerRepo::list_all(&state.pool, query.project_id, query.pagination.limit, query.pagination.offset).await?;

    tracing::debug!(count = triggers.len(), "Listed triggers");

    Ok(Json(DataResponse { data: triggers }))
}

// ---------------------------------------------------------------------------
// GET /admin/triggers/:id
// ---------------------------------------------------------------------------

/// Get a single trigger by ID with aggregated stats.
pub async fn get_trigger(
    State(state): State<AppState>,
    _admin: RequireAdmin,
    Path(id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let trigger = TriggerRepo::find_by_id_with_stats(&state.pool, id)
        .await?
        .ok_or_else(|| {
            AppError::Core(CoreError::NotFound {
                entity: "Trigger",
                id,
            })
        })?;
    Ok(Json(DataResponse { data: trigger }))
}

// ---------------------------------------------------------------------------
// POST /admin/triggers
// ---------------------------------------------------------------------------

/// Create a new trigger rule.
pub async fn create_trigger(
    State(state): State<AppState>,
    RequireAdmin(user): RequireAdmin,
    Json(body): Json<CreateTrigger>,
) -> AppResult<impl IntoResponse> {
    validate_trigger_types(&body.event_type, &body.entity_type)?;

    if let Some(ref mode) = body.execution_mode {
        validate_execution_mode(mode)?;
    }

    let trigger = TriggerRepo::create(&state.pool, &body, Some(user.user_id)).await?;

    tracing::info!(
        trigger_id = trigger.id,
        event_type = %trigger.event_type,
        entity_type = %trigger.entity_type,
        user_id = user.user_id,
        "Trigger created"
    );

    Ok((StatusCode::CREATED, Json(DataResponse { data: trigger })))
}

// ---------------------------------------------------------------------------
// PUT /admin/triggers/:id
// ---------------------------------------------------------------------------

/// Update an existing trigger rule.
pub async fn update_trigger(
    State(state): State<AppState>,
    RequireAdmin(user): RequireAdmin,
    Path(id): Path<DbId>,
    Json(body): Json<UpdateTrigger>,
) -> AppResult<impl IntoResponse> {
    ensure_trigger_exists(&state.pool, id).await?;

    if let Some(ref et) = body.event_type {
        if !trigger_workflow::is_valid_event_type(et) {
            return Err(AppError::Core(CoreError::Validation(format!(
                "Invalid event_type: '{et}'"
            ))));
        }
    }
    if let Some(ref ent) = body.entity_type {
        if !trigger_workflow::is_valid_entity_type(ent) {
            return Err(AppError::Core(CoreError::Validation(format!(
                "Invalid entity_type: '{ent}'"
            ))));
        }
    }
    if let Some(ref mode) = body.execution_mode {
        validate_execution_mode(mode)?;
    }

    let updated = TriggerRepo::update(&state.pool, id, &body)
        .await?
        .ok_or_else(|| {
            AppError::Core(CoreError::NotFound {
                entity: "Trigger",
                id,
            })
        })?;

    tracing::info!(trigger_id = id, user_id = user.user_id, "Trigger updated");

    Ok(Json(DataResponse { data: updated }))
}

// ---------------------------------------------------------------------------
// DELETE /admin/triggers/:id
// ---------------------------------------------------------------------------

/// Delete a trigger by ID.
pub async fn delete_trigger(
    State(state): State<AppState>,
    RequireAdmin(user): RequireAdmin,
    Path(id): Path<DbId>,
) -> AppResult<StatusCode> {
    let deleted = TriggerRepo::delete(&state.pool, id).await?;
    if deleted {
        tracing::info!(trigger_id = id, user_id = user.user_id, "Trigger deleted");
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(AppError::Core(CoreError::NotFound {
            entity: "Trigger",
            id,
        }))
    }
}

// ---------------------------------------------------------------------------
// POST /admin/triggers/:id/dry-run
// ---------------------------------------------------------------------------

/// Dry-run simulation: evaluate what a trigger would do given sample event data.
pub async fn dry_run_trigger(
    State(state): State<AppState>,
    _admin: RequireAdmin,
    Path(id): Path<DbId>,
    Json(body): Json<DryRunRequest>,
) -> AppResult<impl IntoResponse> {
    let trigger = ensure_trigger_exists(&state.pool, id).await?;

    let event_data = body
        .event_data
        .unwrap_or(serde_json::Value::Object(Default::default()));
    let current_depth = body.chain_depth.unwrap_or(0);

    // Parse actions from trigger
    let actions: Vec<TriggerAction> =
        serde_json::from_value(trigger.actions.clone()).unwrap_or_default();

    // Check conditions
    let conditions = trigger
        .conditions
        .clone()
        .unwrap_or(serde_json::Value::Null);
    let conditions_match = trigger_workflow::evaluate_conditions(&event_data, &conditions);

    // Check scope
    let scope = trigger.scope.clone().unwrap_or(serde_json::Value::Null);
    let scope_match = trigger_workflow::evaluate_scope(&event_data, &scope);

    // Evaluate the trigger
    let check_result = trigger_workflow::evaluate_trigger(EvaluateTriggerInput {
        event_type: &trigger.event_type,
        entity_type: &trigger.entity_type,
        trigger_event_type: &trigger.event_type,
        trigger_entity_type: &trigger.entity_type,
        trigger_enabled: trigger.is_enabled,
        trigger_requires_approval: trigger.requires_approval,
        trigger_id: trigger.id,
        current_depth,
        max_depth: trigger.max_chain_depth as u32,
        actions: actions.clone(),
    });

    let would_chain =
        matches!(check_result, TriggerCheckResult::Fire(_)) && conditions_match && scope_match;

    let result = DryRunResult {
        trigger_id: trigger.id,
        trigger_name: trigger.name.clone(),
        actions,
        would_chain,
        chain_depth: current_depth,
    };

    // Log the dry run
    let log_input = CreateTriggerLog {
        trigger_id: trigger.id,
        event_data: Some(event_data),
        actions_taken: Some(serde_json::to_value(&result.actions).unwrap_or_default()),
        chain_depth: Some(current_depth as i32),
        result: trigger_workflow::RESULT_DRY_RUN.to_string(),
        error_message: None,
    };
    TriggerLogRepo::insert(&state.pool, &log_input).await?;

    Ok(Json(DataResponse { data: result }))
}

// ---------------------------------------------------------------------------
// GET /admin/triggers/chain-graph
// ---------------------------------------------------------------------------

/// Get a chain graph of triggers for a project.
///
/// Returns a list of triggers with their downstream connections,
/// showing how triggers chain together.
pub async fn get_chain_graph(
    State(state): State<AppState>,
    _admin: RequireAdmin,
    Query(query): Query<ChainGraphQuery>,
) -> AppResult<impl IntoResponse> {
    let triggers =
        TriggerRepo::list_by_project(&state.pool, query.project_id, Some(MAX_SEARCH_LIMIT), None)
            .await?;

    let nodes: Vec<ChainGraphNode> = triggers
        .into_iter()
        .map(|t| ChainGraphNode {
            trigger_id: t.id,
            name: t.name,
            event_type: t.event_type,
            entity_type: t.entity_type,
            actions: t.actions,
            is_enabled: t.is_enabled,
        })
        .collect();

    Ok(Json(DataResponse { data: nodes }))
}

// ---------------------------------------------------------------------------
// GET /admin/triggers/log
// ---------------------------------------------------------------------------

/// List trigger log entries (paginated).
pub async fn list_trigger_logs(
    State(state): State<AppState>,
    _admin: RequireAdmin,
    Query(params): Query<PaginationParams>,
) -> AppResult<impl IntoResponse> {
    // Clamping happens inside the repo; pass through directly.
    let logs = TriggerLogRepo::list_recent(&state.pool, params.limit, params.offset).await?;

    Ok(Json(DataResponse { data: logs }))
}

// ---------------------------------------------------------------------------
// POST /admin/triggers/pause-all
// ---------------------------------------------------------------------------

/// Emergency disable all triggers.
pub async fn pause_all_triggers(
    State(state): State<AppState>,
    RequireAdmin(user): RequireAdmin,
) -> AppResult<impl IntoResponse> {
    let affected = TriggerRepo::pause_all(&state.pool).await?;

    tracing::warn!(
        affected,
        user_id = user.user_id,
        "All triggers paused (emergency)"
    );

    Ok(Json(DataResponse {
        data: BulkToggleResponse { affected },
    }))
}

// ---------------------------------------------------------------------------
// POST /admin/triggers/resume-all
// ---------------------------------------------------------------------------

/// Re-enable all triggers.
pub async fn resume_all_triggers(
    State(state): State<AppState>,
    RequireAdmin(user): RequireAdmin,
) -> AppResult<impl IntoResponse> {
    let affected = TriggerRepo::resume_all(&state.pool).await?;

    tracing::info!(affected, user_id = user.user_id, "All triggers resumed");

    Ok(Json(DataResponse {
        data: BulkToggleResponse { affected },
    }))
}
