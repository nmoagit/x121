//! Admin handlers for script management and execution (PRD-09).
//!
//! All endpoints require the `admin` role.

use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::Json;
use serde::Deserialize;
use x121_core::scripting::executor::ScriptOutput;
use x121_core::types::DbId;
use x121_db::models::script::{CreateScript, Script, ScriptExecution, UpdateScript};
use x121_db::repositories::{ScriptExecutionRepo, ScriptRepo};

use x121_core::error::CoreError;

use crate::error::{AppError, AppResult};
use crate::middleware::rbac::RequireAdmin;
use crate::response::DataResponse;
use crate::state::AppState;

// ---------------------------------------------------------------------------
// Request / response types
// ---------------------------------------------------------------------------

/// Request body for the test execution endpoint.
#[derive(Debug, Deserialize)]
pub struct TestScriptRequest {
    /// JSON data to pass to the script as stdin input.
    pub test_data: serde_json::Value,
}

/// Query parameters for paginated execution history.
#[derive(Debug, Deserialize)]
pub struct ExecutionListQuery {
    /// Maximum number of results to return (default: 25, max: 100).
    pub limit: Option<i64>,
    /// Offset for pagination (default: 0).
    pub offset: Option<i64>,
}

// ---------------------------------------------------------------------------
// Script CRUD handlers
// ---------------------------------------------------------------------------

/// POST /admin/scripts
///
/// Register a new script in the orchestrator registry.
pub async fn register_script(
    State(state): State<AppState>,
    RequireAdmin(admin): RequireAdmin,
    Json(mut input): Json<CreateScript>,
) -> AppResult<(StatusCode, Json<DataResponse<Script>>)> {
    // Set the creator.
    input.created_by = Some(admin.user_id);

    // Validate that the file path is not empty.
    if input.file_path.is_empty() {
        return Err(AppError::BadRequest("file_path is required".to_string()));
    }

    if input.name.is_empty() {
        return Err(AppError::BadRequest("name is required".to_string()));
    }

    // For Python scripts with requirements: compute the hash.
    if let Some(ref req_path) = input.requirements_path {
        if !req_path.is_empty() {
            match x121_core::scripting::python::PythonExecutor::hash_requirements(req_path).await {
                Ok(hash) => input.requirements_hash = Some(hash),
                Err(_) => {
                    return Err(AppError::BadRequest(format!(
                        "Cannot read requirements file: {req_path}"
                    )));
                }
            }
        }
    }

    let script = ScriptRepo::create(&state.pool, &input).await?;

    // Publish event.
    let event = x121_events::PlatformEvent::new("script.registered")
        .with_source("script", script.id)
        .with_actor(admin.user_id)
        .with_payload(serde_json::json!({
            "name": script.name,
            "script_type": script.script_type_name,
        }));
    state.event_bus.publish(event);

    Ok((StatusCode::CREATED, Json(DataResponse { data: script })))
}

/// GET /admin/scripts
///
/// List all registered scripts.
pub async fn list_scripts(
    State(state): State<AppState>,
    RequireAdmin(_admin): RequireAdmin,
) -> AppResult<Json<DataResponse<Vec<Script>>>> {
    let scripts = ScriptRepo::list_all(&state.pool).await?;
    Ok(Json(DataResponse { data: scripts }))
}

/// GET /admin/scripts/{id}
///
/// Get a single script by ID.
pub async fn get_script(
    State(state): State<AppState>,
    RequireAdmin(_admin): RequireAdmin,
    Path(id): Path<DbId>,
) -> AppResult<Json<DataResponse<Script>>> {
    let script = ScriptRepo::find_by_id(&state.pool, id)
        .await?
        .ok_or_else(|| {
            AppError::Core(CoreError::NotFound {
                entity: "script",
                id,
            })
        })?;

    Ok(Json(DataResponse { data: script }))
}

/// PUT /admin/scripts/{id}
///
/// Update a script's configuration.
pub async fn update_script(
    State(state): State<AppState>,
    RequireAdmin(admin): RequireAdmin,
    Path(id): Path<DbId>,
    Json(input): Json<UpdateScript>,
) -> AppResult<Json<DataResponse<Script>>> {
    let script = ScriptRepo::update(&state.pool, id, &input)
        .await?
        .ok_or_else(|| {
            AppError::Core(CoreError::NotFound {
                entity: "script",
                id,
            })
        })?;

    let event = x121_events::PlatformEvent::new("script.updated")
        .with_source("script", script.id)
        .with_actor(admin.user_id);
    state.event_bus.publish(event);

    Ok(Json(DataResponse { data: script }))
}

/// DELETE /admin/scripts/{id}
///
/// Deactivate a script (soft delete: `is_enabled = false`).
pub async fn deactivate_script(
    State(state): State<AppState>,
    RequireAdmin(admin): RequireAdmin,
    Path(id): Path<DbId>,
) -> AppResult<StatusCode> {
    let deactivated = ScriptRepo::deactivate(&state.pool, id).await?;

    if !deactivated {
        return Err(AppError::Core(CoreError::NotFound {
            entity: "script",
            id,
        }));
    }

    let event = x121_events::PlatformEvent::new("script.deactivated")
        .with_source("script", id)
        .with_actor(admin.user_id);
    state.event_bus.publish(event);

    Ok(StatusCode::NO_CONTENT)
}

// ---------------------------------------------------------------------------
// Script execution handlers
// ---------------------------------------------------------------------------

/// POST /admin/scripts/{id}/test
///
/// Execute a script with test input data. Returns the execution output.
pub async fn test_script(
    State(state): State<AppState>,
    RequireAdmin(admin): RequireAdmin,
    Path(id): Path<DbId>,
    Json(input): Json<TestScriptRequest>,
) -> AppResult<Json<DataResponse<ScriptOutput>>> {
    let orchestrator = state.script_orchestrator.as_ref().ok_or_else(|| {
        AppError::InternalError("Script orchestrator not initialized".to_string())
    })?;

    let output = orchestrator
        .run_script(id, input.test_data, None, Some(admin.user_id))
        .await?;

    Ok(Json(DataResponse { data: output }))
}

/// GET /admin/scripts/{id}/executions
///
/// List execution history for a script (paginated).
pub async fn list_executions(
    State(state): State<AppState>,
    RequireAdmin(_admin): RequireAdmin,
    Path(script_id): Path<DbId>,
    Query(params): Query<ExecutionListQuery>,
) -> AppResult<Json<DataResponse<Vec<ScriptExecution>>>> {
    let limit = params.limit.unwrap_or(25).min(100);
    let offset = params.offset.unwrap_or(0);

    let executions =
        ScriptExecutionRepo::list_by_script(&state.pool, script_id, limit, offset).await?;

    Ok(Json(DataResponse { data: executions }))
}

/// GET /admin/scripts/executions/{id}
///
/// Get full execution detail including stdout/stderr.
pub async fn get_execution(
    State(state): State<AppState>,
    RequireAdmin(_admin): RequireAdmin,
    Path(id): Path<DbId>,
) -> AppResult<Json<DataResponse<ScriptExecution>>> {
    let execution = ScriptExecutionRepo::find_by_id(&state.pool, id)
        .await?
        .ok_or_else(|| {
            AppError::Core(CoreError::NotFound {
                entity: "script_execution",
                id,
            })
        })?;

    Ok(Json(DataResponse { data: execution }))
}
