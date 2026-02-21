//! Handlers for queue management and scheduling (PRD-08).
//!
//! Queue status is public (authenticated). Admin endpoints use `RequireAdmin`.

use axum::extract::{Path, State};
use axum::response::IntoResponse;
use axum::Json;
use serde::{Deserialize, Serialize};
use trulience_core::types::DbId;
use trulience_db::models::job::QueuedJobView;
use trulience_db::models::scheduling::{SetGpuQuota, UpsertSchedulingPolicy};
use trulience_db::repositories::{GpuQuotaRepo, JobRepo, SchedulingPolicyRepo};

use crate::error::{AppError, AppResult};
use crate::middleware::auth::AuthUser;
use crate::middleware::rbac::RequireAdmin;
use crate::response::DataResponse;
use crate::state::AppState;

// ---------------------------------------------------------------------------
// DTOs
// ---------------------------------------------------------------------------

/// Response for GET /queue.
#[derive(Debug, Serialize)]
pub struct QueueStatusResponse {
    pub total_queued: i64,
    pub total_running: i64,
    pub total_scheduled: i64,
    pub estimated_wait_secs: Option<i64>,
    pub jobs: Vec<QueuedJobView>,
}

/// Request body for PUT /admin/queue/reorder.
#[derive(Debug, Deserialize)]
pub struct ReorderRequest {
    pub job_id: DbId,
    pub new_priority: i32,
}

// ---------------------------------------------------------------------------
// Queue status
// ---------------------------------------------------------------------------

/// GET /api/v1/queue
///
/// Returns current queue state: counts, ordered job list, estimated wait.
pub async fn get_queue_status(
    _auth: AuthUser,
    State(state): State<AppState>,
) -> AppResult<impl IntoResponse> {
    let jobs = JobRepo::list_queue(&state.pool).await?;
    let (total_queued, total_running, total_scheduled) =
        JobRepo::queue_counts(&state.pool).await?;

    // Estimate wait: (queued jobs * avg duration) / max(running, 1)
    let estimated_wait_secs = if total_queued > 0 {
        let avg_dur = JobRepo::avg_duration_secs(&state.pool)
            .await?
            .unwrap_or(60.0);
        let workers = total_running.max(1) as f64;
        Some((total_queued as f64 * avg_dur / workers).round() as i64)
    } else {
        None
    };

    let resp = QueueStatusResponse {
        total_queued,
        total_running,
        total_scheduled,
        estimated_wait_secs,
        jobs,
    };

    Ok(Json(DataResponse { data: resp }))
}

// ---------------------------------------------------------------------------
// Admin: reorder
// ---------------------------------------------------------------------------

/// PUT /api/v1/admin/queue/reorder
///
/// Change a job's priority (admin only). Takes effect on next scheduler tick.
pub async fn reorder_job(
    RequireAdmin(admin): RequireAdmin,
    State(state): State<AppState>,
    Json(input): Json<ReorderRequest>,
) -> AppResult<impl IntoResponse> {
    let job = JobRepo::update_priority(&state.pool, input.job_id, input.new_priority)
        .await
        .map_err(|e| AppError::BadRequest(e.to_string()))?;

    tracing::info!(
        job_id = input.job_id,
        new_priority = input.new_priority,
        admin_id = admin.user_id,
        "Job priority updated by admin",
    );

    Ok(Json(DataResponse { data: job }))
}

// ---------------------------------------------------------------------------
// Quota management (admin)
// ---------------------------------------------------------------------------

/// PUT /api/v1/admin/users/{id}/quota
///
/// Set or update a user's GPU time quota. Admin only.
pub async fn set_user_quota(
    RequireAdmin(admin): RequireAdmin,
    State(state): State<AppState>,
    Path(user_id): Path<DbId>,
    Json(input): Json<SetGpuQuota>,
) -> AppResult<impl IntoResponse> {
    let quota = GpuQuotaRepo::set_user_quota(&state.pool, user_id, &input).await?;

    tracing::info!(
        user_id,
        admin_id = admin.user_id,
        daily_limit = ?input.daily_limit_secs,
        weekly_limit = ?input.weekly_limit_secs,
        "User GPU quota updated by admin",
    );

    Ok(Json(DataResponse { data: quota }))
}

// ---------------------------------------------------------------------------
// Quota status (user-facing)
// ---------------------------------------------------------------------------

/// GET /api/v1/quota/status
///
/// Get the current user's GPU quota usage.
pub async fn get_quota_status(
    auth: AuthUser,
    State(state): State<AppState>,
) -> AppResult<impl IntoResponse> {
    let status = GpuQuotaRepo::check_quota(&state.pool, auth.user_id).await?;

    Ok(Json(DataResponse { data: status }))
}

// ---------------------------------------------------------------------------
// Scheduling policies (admin)
// ---------------------------------------------------------------------------

/// GET /api/v1/admin/scheduling/policies
///
/// List all scheduling policies. Admin only.
pub async fn list_scheduling_policies(
    RequireAdmin(_admin): RequireAdmin,
    State(state): State<AppState>,
) -> AppResult<impl IntoResponse> {
    let policies = SchedulingPolicyRepo::list(&state.pool).await?;
    Ok(Json(DataResponse { data: policies }))
}

/// POST /api/v1/admin/scheduling/policies
///
/// Create a new scheduling policy. Admin only.
pub async fn create_scheduling_policy(
    RequireAdmin(admin): RequireAdmin,
    State(state): State<AppState>,
    Json(input): Json<UpsertSchedulingPolicy>,
) -> AppResult<impl IntoResponse> {
    let policy = SchedulingPolicyRepo::create(&state.pool, &input).await?;

    tracing::info!(
        policy_id = policy.id,
        policy_name = %policy.name,
        admin_id = admin.user_id,
        "Scheduling policy created",
    );

    Ok((
        axum::http::StatusCode::CREATED,
        Json(DataResponse { data: policy }),
    ))
}

/// PUT /api/v1/admin/scheduling/policies/{id}
///
/// Update an existing scheduling policy. Admin only.
pub async fn update_scheduling_policy(
    RequireAdmin(admin): RequireAdmin,
    State(state): State<AppState>,
    Path(policy_id): Path<DbId>,
    Json(input): Json<UpsertSchedulingPolicy>,
) -> AppResult<impl IntoResponse> {
    let policy = SchedulingPolicyRepo::update(&state.pool, policy_id, &input)
        .await
        .map_err(|e| AppError::BadRequest(e.to_string()))?;

    tracing::info!(
        policy_id = policy.id,
        policy_name = %policy.name,
        admin_id = admin.user_id,
        "Scheduling policy updated",
    );

    Ok(Json(DataResponse { data: policy }))
}
