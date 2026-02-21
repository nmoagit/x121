//! Handlers for the `/jobs` resource (PRD-07).
//!
//! All endpoints require authentication via [`AuthUser`].
//! Admin users can list all jobs; regular users see only their own.

use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use trulience_core::error::CoreError;
use trulience_core::roles::ROLE_ADMIN;
use trulience_core::types::DbId;
use trulience_db::models::job::{JobListQuery, SubmitJob};
use trulience_db::models::status::JobStatus;
use trulience_db::repositories::JobRepo;

use crate::error::{AppError, AppResult};
use crate::middleware::auth::AuthUser;
use crate::response::DataResponse;
use crate::state::AppState;

use trulience_db::models::job::Job;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Fetch a job by ID and verify the caller owns it (or is admin).
///
/// Returns `NotFound` if the job does not exist, `Forbidden` if the caller
/// is not the owner and is not an admin. `action` is used in the error
/// message (e.g. "view", "cancel", "retry").
async fn find_and_authorize(
    pool: &sqlx::PgPool,
    job_id: DbId,
    auth: &AuthUser,
    action: &str,
) -> AppResult<Job> {
    let job = JobRepo::find_by_id(pool, job_id)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "Job",
            id: job_id,
        }))?;

    if job.submitted_by != auth.user_id && auth.role != ROLE_ADMIN {
        return Err(AppError::Core(CoreError::Forbidden(format!(
            "Cannot {action} another user's job"
        ))));
    }

    Ok(job)
}

// ---------------------------------------------------------------------------
// Submit
// ---------------------------------------------------------------------------

/// POST /api/v1/jobs
///
/// Submit a new background job. Returns 201 with the created job.
/// The job starts in `pending` status and will be picked up by the
/// dispatcher.
pub async fn submit_job(
    auth: AuthUser,
    State(state): State<AppState>,
    Json(input): Json<SubmitJob>,
) -> AppResult<impl IntoResponse> {
    let job = JobRepo::submit(&state.pool, auth.user_id, &input).await?;

    tracing::info!(
        job_id = job.id,
        job_type = %job.job_type,
        user_id = auth.user_id,
        "Job submitted",
    );

    Ok((StatusCode::CREATED, Json(DataResponse { data: job })))
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

/// GET /api/v1/jobs
///
/// List jobs. Admin users see all jobs; regular users see only their own.
/// Supports optional `status_id`, `limit`, and `offset` query parameters.
pub async fn list_jobs(
    auth: AuthUser,
    State(state): State<AppState>,
    Query(params): Query<JobListQuery>,
) -> AppResult<impl IntoResponse> {
    let jobs = if auth.role == ROLE_ADMIN {
        JobRepo::list_all(&state.pool, &params).await?
    } else {
        JobRepo::list_by_user(&state.pool, auth.user_id, &params).await?
    };

    Ok(Json(DataResponse { data: jobs }))
}

// ---------------------------------------------------------------------------
// Get
// ---------------------------------------------------------------------------

/// GET /api/v1/jobs/{id}
///
/// Get a single job by ID. Users can only view their own jobs; admins
/// can view any job.
pub async fn get_job(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(job_id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let job = find_and_authorize(&state.pool, job_id, &auth, "view").await?;
    Ok(Json(DataResponse { data: job }))
}

// ---------------------------------------------------------------------------
// Cancel
// ---------------------------------------------------------------------------

/// POST /api/v1/jobs/{id}/cancel
///
/// Cancel a pending or running job. Users can only cancel their own jobs;
/// admins can cancel any job.  Returns 204 on success, 409 if the job
/// is already in a terminal state.
pub async fn cancel_job(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(job_id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let job = find_and_authorize(&state.pool, job_id, &auth, "cancel").await?;

    let cancelled = JobRepo::cancel(&state.pool, job_id).await?;

    if !cancelled {
        return Err(AppError::Core(CoreError::Conflict(
            "Job is already in a terminal state and cannot be cancelled".into(),
        )));
    }

    // If the job was running on a worker, send a cancel signal to ComfyUI.
    if job.worker_id.is_some() {
        if let Err(e) = state.comfyui_manager.cancel_job(job_id).await {
            tracing::warn!(
                job_id,
                error = %e,
                "Failed to send cancel signal to ComfyUI (job already marked cancelled in DB)",
            );
        }
    }

    tracing::info!(job_id, user_id = auth.user_id, "Job cancelled");

    Ok(StatusCode::NO_CONTENT)
}

// ---------------------------------------------------------------------------
// Retry
// ---------------------------------------------------------------------------

/// POST /api/v1/jobs/{id}/retry
///
/// Create a new job from a failed job's parameters. Only failed jobs can
/// be retried. The new job has `retry_of_job_id` pointing to the original
/// and starts in `pending` status. This is the ONLY way to retry a job;
/// no automatic retry exists.
pub async fn retry_job(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(job_id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let original = find_and_authorize(&state.pool, job_id, &auth, "retry").await?;

    if original.status_id != JobStatus::Failed.id() {
        return Err(AppError::BadRequest(
            "Only failed jobs can be retried".into(),
        ));
    }

    let new_job = JobRepo::retry(&state.pool, job_id, auth.user_id).await?;

    tracing::info!(
        original_job_id = job_id,
        new_job_id = new_job.id,
        user_id = auth.user_id,
        "Job retried",
    );

    Ok((StatusCode::CREATED, Json(DataResponse { data: new_job })))
}
