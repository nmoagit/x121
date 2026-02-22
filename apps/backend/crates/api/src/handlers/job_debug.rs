//! Handlers for the interactive job debugger (PRD-34).
//!
//! Provides mid-run control: pause, resume, parameter modification,
//! intermediate preview retrieval, and abort with reason.
//! All endpoints require authentication and are scoped under `/jobs/{id}/debug`.

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use trulience_core::error::CoreError;
use trulience_core::job_debug;
use trulience_core::types::DbId;
use trulience_db::models::job_debug::{AbortJobRequest, PauseJobRequest, UpdateParamsRequest};
use trulience_db::repositories::JobDebugRepo;

use crate::error::{AppError, AppResult};
use crate::handlers::jobs::find_and_authorize;
use crate::middleware::auth::AuthUser;
use crate::response::DataResponse;
use crate::state::AppState;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Ensure a debug state row exists for the given job, returning it if found.
async fn ensure_debug_state_exists(
    pool: &sqlx::PgPool,
    job_id: DbId,
) -> AppResult<trulience_db::models::job_debug::JobDebugState> {
    JobDebugRepo::find_by_job_id(pool, job_id)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "JobDebugState",
            id: job_id,
        }))
}

// ---------------------------------------------------------------------------
// GET /jobs/{id}/debug
// ---------------------------------------------------------------------------

/// GET /api/v1/jobs/{id}/debug
///
/// Get the full debug state for a job.
pub async fn get_debug_state(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(job_id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    find_and_authorize(&state.pool, job_id, &auth, "view debug state for").await?;

    let debug_state = ensure_debug_state_exists(&state.pool, job_id).await?;

    Ok(Json(DataResponse { data: debug_state }))
}

// ---------------------------------------------------------------------------
// POST /jobs/{id}/debug/pause
// ---------------------------------------------------------------------------

/// POST /api/v1/jobs/{id}/debug/pause
///
/// Pause a running job and record the pause step in debug state.
/// Creates the debug state row if it does not yet exist.
pub async fn pause_job(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(job_id): Path<DbId>,
    Json(input): Json<PauseJobRequest>,
) -> AppResult<impl IntoResponse> {
    find_and_authorize(&state.pool, job_id, &auth, "pause").await?;

    job_debug::validate_control_action("pause")
        .map_err(AppError::Core)?;

    // Ensure debug state row exists.
    JobDebugRepo::upsert(&state.pool, job_id).await?;

    let step = input.step.unwrap_or(0);
    let debug_state = JobDebugRepo::update_pause_state(&state.pool, job_id, step).await?;

    tracing::info!(job_id, step, user_id = auth.user_id, "Job debug: paused");

    Ok((StatusCode::OK, Json(DataResponse { data: debug_state })))
}

// ---------------------------------------------------------------------------
// POST /jobs/{id}/debug/resume
// ---------------------------------------------------------------------------

/// POST /api/v1/jobs/{id}/debug/resume
///
/// Resume a paused job by clearing the pause state.
pub async fn resume_job(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(job_id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    find_and_authorize(&state.pool, job_id, &auth, "resume").await?;

    job_debug::validate_control_action("resume")
        .map_err(AppError::Core)?;

    ensure_debug_state_exists(&state.pool, job_id).await?;

    let debug_state = JobDebugRepo::clear_pause_state(&state.pool, job_id).await?;

    tracing::info!(job_id, user_id = auth.user_id, "Job debug: resumed");

    Ok(Json(DataResponse { data: debug_state }))
}

// ---------------------------------------------------------------------------
// PUT /jobs/{id}/debug/params
// ---------------------------------------------------------------------------

/// PUT /api/v1/jobs/{id}/debug/params
///
/// Update mid-run parameters for a paused job.
pub async fn update_params(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(job_id): Path<DbId>,
    Json(input): Json<UpdateParamsRequest>,
) -> AppResult<impl IntoResponse> {
    find_and_authorize(&state.pool, job_id, &auth, "update params for").await?;

    // Validate modified params.
    job_debug::validate_modified_params(&input.params)
        .map_err(AppError::Core)?;

    ensure_debug_state_exists(&state.pool, job_id).await?;

    let debug_state =
        JobDebugRepo::update_modified_params(&state.pool, job_id, &input.params).await?;

    tracing::info!(
        job_id,
        user_id = auth.user_id,
        "Job debug: parameters updated"
    );

    Ok(Json(DataResponse { data: debug_state }))
}

// ---------------------------------------------------------------------------
// GET /jobs/{id}/debug/preview
// ---------------------------------------------------------------------------

/// GET /api/v1/jobs/{id}/debug/preview
///
/// Get intermediate preview data for a job.
pub async fn get_preview(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(job_id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    find_and_authorize(&state.pool, job_id, &auth, "view preview for").await?;

    let debug_state = ensure_debug_state_exists(&state.pool, job_id).await?;

    Ok(Json(DataResponse {
        data: debug_state.intermediate_previews,
    }))
}

// ---------------------------------------------------------------------------
// POST /jobs/{id}/debug/abort
// ---------------------------------------------------------------------------

/// POST /api/v1/jobs/{id}/debug/abort
///
/// Abort a running or paused job with an optional reason.
pub async fn abort_job(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(job_id): Path<DbId>,
    Json(input): Json<AbortJobRequest>,
) -> AppResult<impl IntoResponse> {
    find_and_authorize(&state.pool, job_id, &auth, "abort").await?;

    job_debug::validate_control_action("abort")
        .map_err(AppError::Core)?;
    job_debug::validate_abort_reason(&input.reason)
        .map_err(AppError::Core)?;

    // Ensure debug state row exists.
    JobDebugRepo::upsert(&state.pool, job_id).await?;

    let reason = input.reason.as_deref().unwrap_or("User aborted");
    let debug_state = JobDebugRepo::set_abort_reason(&state.pool, job_id, reason).await?;

    tracing::info!(
        job_id,
        user_id = auth.user_id,
        reason,
        "Job debug: aborted"
    );

    Ok(Json(DataResponse { data: debug_state }))
}
