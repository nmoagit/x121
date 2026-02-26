//! Handlers for Pipeline Stage Hooks (PRD-77).
//!
//! Provides endpoints for creating, listing, updating, deleting, testing,
//! and resolving inherited hooks, as well as viewing execution logs.

use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;

use serde::Deserialize;

use x121_core::error::CoreError;
use x121_core::pipeline_hooks::{self, EffectiveHook, HookInput, HookPoint, HookType, ScopeType};
use x121_core::search::{clamp_limit, clamp_offset, DEFAULT_SEARCH_LIMIT, MAX_SEARCH_LIMIT};
use x121_core::types::DbId;
use x121_db::models::hook::{CreateHook, Hook, HookFilter, UpdateHook};
use x121_db::models::hook_execution_log::CreateHookExecutionLog;
use x121_db::repositories::HookExecutionLogRepo;
use x121_db::repositories::HookRepo;

use crate::error::{AppError, AppResult};
use crate::middleware::auth::AuthUser;
use crate::query::PaginationParams;
use crate::response::DataResponse;
use crate::state::AppState;

// ---------------------------------------------------------------------------
// Query / request types
// ---------------------------------------------------------------------------

/// Request body for toggling a hook's enabled state.
#[derive(Debug, Deserialize)]
pub struct ToggleRequest {
    pub enabled: bool,
}

/// Request body for testing a hook with sample data.
#[derive(Debug, Deserialize)]
pub struct TestHookRequest {
    pub input_json: Option<serde_json::Value>,
    pub job_id: Option<DbId>,
}

/// Query parameter for filtering effective hooks by hook_point.
#[derive(Debug, Deserialize)]
pub struct EffectiveHookQuery {
    pub hook_point: Option<String>,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Verify that a hook exists, returning the full row.
async fn ensure_hook_exists(pool: &sqlx::PgPool, id: DbId) -> AppResult<Hook> {
    HookRepo::find_by_id(pool, id)
        .await?
        .ok_or_else(|| AppError::Core(CoreError::NotFound { entity: "Hook", id }))
}

/// Convert a DB `Hook` row into a `HookInput` for the core resolver.
fn hook_to_input(h: &Hook) -> HookInput {
    HookInput {
        id: h.id,
        name: h.name.clone(),
        hook_type: HookType::from_str(&h.hook_type).unwrap_or(HookType::Shell),
        hook_point: HookPoint::from_str(&h.hook_point).unwrap_or(HookPoint::PostVariant),
        scope_type: ScopeType::from_str(&h.scope_type).unwrap_or(ScopeType::Studio),
        failure_mode: pipeline_hooks::FailureMode::from_str(&h.failure_mode)
            .unwrap_or(pipeline_hooks::FailureMode::Warn),
        config_json: h.config_json.clone(),
        sort_order: h.sort_order,
        enabled: h.enabled,
    }
}

// ---------------------------------------------------------------------------
// POST /hooks
// ---------------------------------------------------------------------------

/// Create a new hook.
pub async fn create_hook(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(body): Json<CreateHook>,
) -> AppResult<impl IntoResponse> {
    // Validate name
    pipeline_hooks::validate_hook_name(&body.name)?;

    // Validate type, point, scope
    let hook_type = HookType::from_str(&body.hook_type)?;
    HookPoint::from_str(&body.hook_point)?;
    ScopeType::from_str(&body.scope_type)?;

    // Validate config
    pipeline_hooks::validate_hook_config(&hook_type, &body.config_json)?;

    // Validate sort_order if provided
    if let Some(order) = body.sort_order {
        pipeline_hooks::validate_sort_order(order)?;
    }

    let input = CreateHook {
        created_by: Some(auth.user_id),
        ..body
    };

    let hook = HookRepo::create(&state.pool, &input).await?;

    tracing::info!(
        hook_id = hook.id,
        hook_type = %hook.hook_type,
        hook_point = %hook.hook_point,
        user_id = auth.user_id,
        "Hook created"
    );

    Ok((StatusCode::CREATED, Json(DataResponse { data: hook })))
}

// ---------------------------------------------------------------------------
// GET /hooks
// ---------------------------------------------------------------------------

/// List hooks with optional filtering.
pub async fn list_hooks(
    State(state): State<AppState>,
    Query(filter): Query<HookFilter>,
) -> AppResult<impl IntoResponse> {
    let hooks = HookRepo::list(&state.pool, &filter).await?;

    tracing::debug!(count = hooks.len(), "Listed hooks");

    Ok(Json(DataResponse { data: hooks }))
}

// ---------------------------------------------------------------------------
// GET /hooks/{id}
// ---------------------------------------------------------------------------

/// Get a single hook by ID.
pub async fn get_hook(
    State(state): State<AppState>,
    Path(id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let hook = ensure_hook_exists(&state.pool, id).await?;
    Ok(Json(DataResponse { data: hook }))
}

// ---------------------------------------------------------------------------
// PUT /hooks/{id}
// ---------------------------------------------------------------------------

/// Update an existing hook.
pub async fn update_hook(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<DbId>,
    Json(body): Json<UpdateHook>,
) -> AppResult<impl IntoResponse> {
    ensure_hook_exists(&state.pool, id).await?;

    // Validate fields if provided
    if let Some(ref name) = body.name {
        pipeline_hooks::validate_hook_name(name)?;
    }
    if let Some(ref ht) = body.hook_type {
        HookType::from_str(ht)?;
    }
    if let Some(ref fm) = body.failure_mode {
        pipeline_hooks::FailureMode::from_str(fm)?;
    }
    if let Some(order) = body.sort_order {
        pipeline_hooks::validate_sort_order(order)?;
    }

    // If both hook_type and config_json are provided, cross-validate
    if let (Some(ref ht), Some(ref cfg)) = (&body.hook_type, &body.config_json) {
        let hook_type = HookType::from_str(ht)?;
        pipeline_hooks::validate_hook_config(&hook_type, cfg)?;
    }

    let updated = HookRepo::update(&state.pool, id, &body)
        .await?
        .ok_or_else(|| AppError::Core(CoreError::NotFound { entity: "Hook", id }))?;

    tracing::info!(hook_id = id, user_id = auth.user_id, "Hook updated");

    Ok(Json(DataResponse { data: updated }))
}

// ---------------------------------------------------------------------------
// DELETE /hooks/{id}
// ---------------------------------------------------------------------------

/// Delete a hook by ID.
pub async fn delete_hook(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<DbId>,
) -> AppResult<StatusCode> {
    let deleted = HookRepo::delete(&state.pool, id).await?;
    if deleted {
        tracing::info!(hook_id = id, user_id = auth.user_id, "Hook deleted");
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(AppError::Core(CoreError::NotFound { entity: "Hook", id }))
    }
}

// ---------------------------------------------------------------------------
// PATCH /hooks/{id}/toggle
// ---------------------------------------------------------------------------

/// Toggle a hook's enabled state.
pub async fn toggle_hook(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<DbId>,
    Json(body): Json<ToggleRequest>,
) -> AppResult<impl IntoResponse> {
    ensure_hook_exists(&state.pool, id).await?;

    let toggled = HookRepo::toggle_enabled(&state.pool, id, body.enabled).await?;
    if !toggled {
        return Err(AppError::Core(CoreError::NotFound { entity: "Hook", id }));
    }

    tracing::info!(
        hook_id = id,
        enabled = body.enabled,
        user_id = auth.user_id,
        "Hook toggled"
    );

    // Re-fetch to return the updated row
    let hook = ensure_hook_exists(&state.pool, id).await?;
    Ok(Json(DataResponse { data: hook }))
}

// ---------------------------------------------------------------------------
// POST /hooks/{id}/test
// ---------------------------------------------------------------------------

/// Test a hook with sample input data.
///
/// Executes a dry-run simulation and logs the result. In a production
/// implementation this would invoke the shell/Python/webhook; here we
/// record a simulated execution.
pub async fn test_hook(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<DbId>,
    Json(body): Json<TestHookRequest>,
) -> AppResult<impl IntoResponse> {
    let hook = ensure_hook_exists(&state.pool, id).await?;

    // Simulate execution (placeholder for actual hook runner integration)
    let start = std::time::Instant::now();
    let (success, exit_code, output, error_msg) = simulate_hook_execution(&hook);
    let duration_ms = start.elapsed().as_millis() as i64;

    let log_input = CreateHookExecutionLog {
        hook_id: id,
        job_id: body.job_id,
        input_json: body.input_json,
        output_text: Some(output),
        exit_code: Some(exit_code),
        duration_ms: Some(duration_ms),
        success,
        error_message: error_msg,
    };

    let log = HookExecutionLogRepo::create(&state.pool, &log_input).await?;

    tracing::info!(
        hook_id = id,
        success,
        duration_ms,
        user_id = auth.user_id,
        "Hook tested"
    );

    Ok((StatusCode::CREATED, Json(DataResponse { data: log })))
}

/// Simulate a hook execution, returning (success, exit_code, output, error_message).
fn simulate_hook_execution(hook: &Hook) -> (bool, i32, String, Option<String>) {
    match hook.hook_type.as_str() {
        "shell" | "python" => {
            let script_path = hook
                .config_json
                .get("script_path")
                .and_then(|v| v.as_str())
                .unwrap_or("<unknown>");
            (
                true,
                0,
                format!("[test] Would execute {}: {}", hook.hook_type, script_path),
                None,
            )
        }
        "webhook" => {
            let url = hook
                .config_json
                .get("url")
                .and_then(|v| v.as_str())
                .unwrap_or("<unknown>");
            (
                true,
                0,
                format!("[test] Would POST to webhook: {url}"),
                None,
            )
        }
        _ => (
            false,
            1,
            String::new(),
            Some(format!("Unknown hook type: {}", hook.hook_type)),
        ),
    }
}

// ---------------------------------------------------------------------------
// GET /hooks/effective/{scope_type}/{scope_id}
// ---------------------------------------------------------------------------

/// Resolve effective hooks for a given scope after applying inheritance.
pub async fn get_effective_hooks(
    State(state): State<AppState>,
    Path((scope_type, scope_id)): Path<(String, DbId)>,
    Query(query): Query<EffectiveHookQuery>,
) -> AppResult<impl IntoResponse> {
    // Validate scope_type
    ScopeType::from_str(&scope_type)?;

    // Determine which hook_points to resolve
    let hook_points: Vec<String> = if let Some(ref hp) = query.hook_point {
        HookPoint::from_str(hp)?;
        vec![hp.clone()]
    } else {
        vec![
            "post_variant".to_string(),
            "pre_segment".to_string(),
            "post_segment".to_string(),
            "pre_concatenation".to_string(),
            "post_delivery".to_string(),
        ]
    };

    let mut all_effective: Vec<EffectiveHook> = Vec::new();

    for hp in &hook_points {
        // Fetch hooks at each level
        let studio_hooks = HookRepo::list_by_scope(&state.pool, "studio", None, hp).await?;
        let project_hooks =
            HookRepo::list_by_scope(&state.pool, "project", Some(scope_id), hp).await?;
        let scene_type_hooks = if scope_type == "scene_type" {
            HookRepo::list_by_scope(&state.pool, "scene_type", Some(scope_id), hp).await?
        } else {
            vec![]
        };

        let studio_inputs: Vec<HookInput> = studio_hooks.iter().map(hook_to_input).collect();
        let project_inputs: Vec<HookInput> = project_hooks.iter().map(hook_to_input).collect();
        let scene_inputs: Vec<HookInput> = scene_type_hooks.iter().map(hook_to_input).collect();

        let resolved =
            pipeline_hooks::resolve_effective_hooks(&studio_inputs, &project_inputs, &scene_inputs);

        all_effective.extend(resolved);
    }

    Ok(Json(DataResponse {
        data: all_effective,
    }))
}

// ---------------------------------------------------------------------------
// GET /hooks/{id}/logs
// ---------------------------------------------------------------------------

/// List execution logs for a specific hook.
pub async fn list_hook_logs(
    State(state): State<AppState>,
    Path(hook_id): Path<DbId>,
    Query(params): Query<PaginationParams>,
) -> AppResult<impl IntoResponse> {
    ensure_hook_exists(&state.pool, hook_id).await?;

    let limit = clamp_limit(params.limit, DEFAULT_SEARCH_LIMIT, MAX_SEARCH_LIMIT);
    let offset = clamp_offset(params.offset);

    let logs = HookExecutionLogRepo::list_for_hook(&state.pool, hook_id, limit, offset).await?;

    Ok(Json(DataResponse { data: logs }))
}

// ---------------------------------------------------------------------------
// GET /jobs/{job_id}/hook-logs
// ---------------------------------------------------------------------------

/// List hook execution logs for a specific job.
pub async fn list_job_hook_logs(
    State(state): State<AppState>,
    Path(job_id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let logs = HookExecutionLogRepo::list_for_job(&state.pool, job_id).await?;
    Ok(Json(DataResponse { data: logs }))
}
