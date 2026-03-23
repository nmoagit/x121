//! Handlers for pipeline generator scripts (PRD-143).
//!
//! CRUD endpoints under `/admin/generator-scripts` plus script execution.

use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use serde::{Deserialize, Serialize};
use x121_core::error::CoreError;
use x121_core::types::DbId;
use x121_db::models::pipeline_generator_script::{
    is_valid_script_type, CreatePipelineGeneratorScript, UpdatePipelineGeneratorScript,
};
use x121_db::repositories::{AvatarRepo, PipelineGeneratorScriptRepo, ProjectRepo};

use crate::error::{AppError, AppResult};
use crate::response::DataResponse;
use crate::state::AppState;

/// Query parameters for listing generator scripts.
#[derive(Debug, Deserialize)]
pub struct ListScriptsQuery {
    pub pipeline_id: Option<DbId>,
}

/// Request body for executing a script.
#[derive(Debug, Deserialize)]
pub struct ExecuteScriptRequest {
    pub avatar_id: DbId,
}

/// Response from script execution.
#[derive(Debug, Serialize)]
pub struct ExecuteScriptResponse {
    pub output_json: Option<serde_json::Value>,
    pub stderr: String,
    pub duration_ms: u64,
    pub script_version: i32,
}

// ---------------------------------------------------------------------------
// CRUD handlers
// ---------------------------------------------------------------------------

/// GET /api/v1/admin/generator-scripts?pipeline_id=N
///
/// List generator scripts, optionally filtered by pipeline.
pub async fn list_scripts(
    State(state): State<AppState>,
    Query(params): Query<ListScriptsQuery>,
) -> AppResult<impl IntoResponse> {
    let scripts = PipelineGeneratorScriptRepo::list(&state.pool, params.pipeline_id).await?;
    Ok(Json(DataResponse { data: scripts }))
}

/// GET /api/v1/admin/generator-scripts/{id}
///
/// Get a single generator script by ID, including full content.
pub async fn get_script(
    State(state): State<AppState>,
    Path(id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let script = PipelineGeneratorScriptRepo::find_by_id(&state.pool, id)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "PipelineGeneratorScript",
            id,
        }))?;
    Ok(Json(DataResponse { data: script }))
}

/// POST /api/v1/admin/generator-scripts
///
/// Create a new generator script.
pub async fn create_script(
    State(state): State<AppState>,
    Json(input): Json<CreatePipelineGeneratorScript>,
) -> AppResult<impl IntoResponse> {
    if input.name.trim().is_empty() {
        return Err(AppError::BadRequest("name must not be empty".to_string()));
    }
    if input.script_content.trim().is_empty() {
        return Err(AppError::BadRequest(
            "script_content must not be empty".to_string(),
        ));
    }
    if !is_valid_script_type(&input.script_type) {
        return Err(AppError::BadRequest(format!(
            "script_type must be one of: python, javascript, shell (got '{}')",
            input.script_type
        )));
    }

    let script = PipelineGeneratorScriptRepo::create(&state.pool, &input).await?;
    Ok((StatusCode::CREATED, Json(DataResponse { data: script })))
}

/// PUT /api/v1/admin/generator-scripts/{id}
///
/// Update a generator script. Automatically increments the version number.
pub async fn update_script(
    State(state): State<AppState>,
    Path(id): Path<DbId>,
    Json(input): Json<UpdatePipelineGeneratorScript>,
) -> AppResult<impl IntoResponse> {
    let script = PipelineGeneratorScriptRepo::update(&state.pool, id, &input)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "PipelineGeneratorScript",
            id,
        }))?;
    Ok(Json(DataResponse { data: script }))
}

/// DELETE /api/v1/admin/generator-scripts/{id}
///
/// Soft-delete (deactivate) a generator script.
pub async fn delete_script(
    State(state): State<AppState>,
    Path(id): Path<DbId>,
) -> AppResult<StatusCode> {
    let deactivated = PipelineGeneratorScriptRepo::deactivate(&state.pool, id).await?;
    if deactivated {
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(AppError::Core(CoreError::NotFound {
            entity: "PipelineGeneratorScript",
            id,
        }))
    }
}

// ---------------------------------------------------------------------------
// Execution handler
// ---------------------------------------------------------------------------

/// POST /api/v1/admin/generator-scripts/{id}/execute
///
/// Execute a generator script against an avatar's metadata. Loads the avatar's
/// bio.json and tov.json, passes them to the script, and returns the output.
pub async fn execute_script(
    State(state): State<AppState>,
    Path(id): Path<DbId>,
    Json(body): Json<ExecuteScriptRequest>,
) -> AppResult<impl IntoResponse> {
    let script = PipelineGeneratorScriptRepo::find_by_id(&state.pool, id)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "PipelineGeneratorScript",
            id,
        }))?;

    // Load avatar and verify it belongs to the same pipeline.
    let avatar = AvatarRepo::find_by_id(&state.pool, body.avatar_id)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "Avatar",
            id: body.avatar_id,
        }))?;

    let project = ProjectRepo::find_by_id(&state.pool, avatar.project_id)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "Project",
            id: avatar.project_id,
        }))?;

    if project.pipeline_id != script.pipeline_id {
        return Err(AppError::BadRequest(
            "Avatar does not belong to the same pipeline as the script".to_string(),
        ));
    }

    // Build input JSON from avatar metadata.
    let bio_json = avatar.metadata.clone().unwrap_or(serde_json::json!({}));

    let input_json = serde_json::json!({
        "avatar_id": body.avatar_id,
        "avatar_name": avatar.name,
        "bio": bio_json,
    });

    // Execute the script.
    let output = x121_core::script_executor::execute_script(
        &script.script_type,
        &script.script_content,
        &input_json,
    )
    .await
    .map_err(|e| AppError::InternalError(format!("Script execution failed: {e}")))?;

    Ok(Json(DataResponse {
        data: ExecuteScriptResponse {
            output_json: output.output_json,
            stderr: output.stderr,
            duration_ms: output.duration_ms,
            script_version: script.version,
        },
    }))
}
