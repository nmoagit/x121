//! Handlers for pipeline checkpoints and failure diagnostics (PRD-28).
//!
//! All endpoints require authentication and are scoped under `/jobs/{id}/...`.

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use serde::{Deserialize, Serialize};
use trulience_core::error::CoreError;
use trulience_core::types::DbId;
use trulience_db::models::status::JobStatus;
use trulience_db::repositories::{CheckpointRepo, JobRepo};

use crate::error::{AppError, AppResult};
use crate::handlers::jobs::find_and_authorize;
use crate::middleware::auth::AuthUser;
use crate::response::DataResponse;
use crate::state::AppState;

// ---------------------------------------------------------------------------
// List checkpoints
// ---------------------------------------------------------------------------

/// GET /api/v1/jobs/{id}/checkpoints
///
/// List all checkpoints for a job, ordered by stage index.
pub async fn list_checkpoints(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(job_id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    find_and_authorize(&state.pool, job_id, &auth, "view checkpoints for").await?;

    let checkpoints = CheckpointRepo::list_by_job(&state.pool, job_id).await?;

    Ok(Json(DataResponse { data: checkpoints }))
}

// ---------------------------------------------------------------------------
// Get single checkpoint
// ---------------------------------------------------------------------------

/// GET /api/v1/jobs/{id}/checkpoints/{checkpoint_id}
///
/// Get a single checkpoint by ID (must belong to the specified job).
pub async fn get_checkpoint(
    auth: AuthUser,
    State(state): State<AppState>,
    Path((job_id, checkpoint_id)): Path<(DbId, DbId)>,
) -> AppResult<impl IntoResponse> {
    find_and_authorize(&state.pool, job_id, &auth, "view checkpoint for").await?;

    let checkpoint = CheckpointRepo::find_by_id(&state.pool, checkpoint_id)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "Checkpoint",
            id: checkpoint_id,
        }))?;

    // Verify the checkpoint belongs to the requested job.
    if checkpoint.job_id != job_id {
        return Err(AppError::Core(CoreError::NotFound {
            entity: "Checkpoint",
            id: checkpoint_id,
        }));
    }

    Ok(Json(DataResponse { data: checkpoint }))
}

// ---------------------------------------------------------------------------
// Resume from checkpoint
// ---------------------------------------------------------------------------

/// Request body for `POST /jobs/{id}/resume-from-checkpoint`.
#[derive(Debug, Deserialize)]
pub struct ResumeFromCheckpointInput {
    /// Optional modified parameters to apply before resuming.
    pub modified_params: Option<serde_json::Value>,
}

/// POST /api/v1/jobs/{id}/resume-from-checkpoint
///
/// Create a new job that resumes from the last checkpoint of a failed job.
/// The new job is linked to the original via `original_job_id` and
/// `resumed_from_checkpoint_id`.
pub async fn resume_from_checkpoint(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(job_id): Path<DbId>,
    Json(input): Json<ResumeFromCheckpointInput>,
) -> AppResult<impl IntoResponse> {
    let original = find_and_authorize(&state.pool, job_id, &auth, "resume").await?;

    // Only failed jobs can be resumed from a checkpoint.
    if original.status_id != JobStatus::Failed.id() {
        return Err(AppError::BadRequest(
            "Only failed jobs can be resumed from a checkpoint".into(),
        ));
    }

    // Find the latest checkpoint for this job.
    let checkpoint = CheckpointRepo::find_latest_for_job(&state.pool, job_id)
        .await?
        .ok_or(AppError::BadRequest(
            "No checkpoints available for this job".into(),
        ))?;

    // Merge parameters: original + modifications.
    let parameters = if let Some(modified) = &input.modified_params {
        let mut merged = original.parameters.clone();
        if let (Some(base), Some(overrides)) = (merged.as_object_mut(), modified.as_object()) {
            for (k, v) in overrides {
                base.insert(k.clone(), v.clone());
            }
        }
        merged
    } else {
        original.parameters.clone()
    };

    // Create a new job linked to the original via the repository.
    let new_job = JobRepo::resume_from_checkpoint(
        &state.pool,
        auth.user_id,
        &original,
        checkpoint.id,
        &parameters,
    )
    .await?;

    tracing::info!(
        original_job_id = job_id,
        new_job_id = new_job.id,
        checkpoint_id = checkpoint.id,
        checkpoint_stage = checkpoint.stage_index,
        user_id = auth.user_id,
        "Job resumed from checkpoint",
    );

    Ok((StatusCode::CREATED, Json(DataResponse { data: new_job })))
}

// ---------------------------------------------------------------------------
// Failure diagnostics
// ---------------------------------------------------------------------------

/// Typed response for failure diagnostics (replaces ad-hoc `serde_json::json!`).
#[derive(Debug, Serialize)]
struct JobDiagnosticsResponse {
    job_id: DbId,
    failure_stage_index: Option<i32>,
    failure_stage_name: Option<String>,
    failure_diagnostics: Option<serde_json::Value>,
    last_checkpoint_id: Option<DbId>,
    original_job_id: Option<DbId>,
}

/// GET /api/v1/jobs/{id}/diagnostics
///
/// Get structured failure diagnostics for a job.
pub async fn get_failure_diagnostics(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(job_id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let job = find_and_authorize(&state.pool, job_id, &auth, "view diagnostics for").await?;

    let diagnostics = JobDiagnosticsResponse {
        job_id: job.id,
        failure_stage_index: job.failure_stage_index,
        failure_stage_name: job.failure_stage_name.clone(),
        failure_diagnostics: job.failure_diagnostics.clone(),
        last_checkpoint_id: job.last_checkpoint_id,
        original_job_id: job.original_job_id,
    };

    Ok(Json(DataResponse { data: diagnostics }))
}
