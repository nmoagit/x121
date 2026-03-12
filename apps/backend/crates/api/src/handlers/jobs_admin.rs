//! Admin-only job management handlers (PRD-132 Phases 4-7).
//!
//! All endpoints require [`RequireAdmin`]. Covers:
//! - Reassignment, hold/release, move-to-front (Phase 4-6)
//! - Bulk cancel, redistribute (Phase 6)
//! - Queue statistics, enhanced listing (Phase 7)
//! - Drain mode, ComfyUI instance listing (Phase 5)

use axum::extract::{Path, Query, State};
use axum::response::IntoResponse;
use axum::Json;
use serde::{Deserialize, Serialize};
use x121_core::activity::{ActivityLogEntry, ActivityLogLevel, ActivityLogSource};
use x121_core::error::CoreError;
use x121_core::types::DbId;
use x121_db::models::status::JobStatus;
use x121_db::repositories::{AdminQueueFilter, BulkCancelFilter, ComfyUIInstanceRepo, JobRepo};

use crate::error::{AppError, AppResult};
use crate::middleware::rbac::RequireAdmin;
use crate::response::DataResponse;
use crate::state::AppState;

// ---------------------------------------------------------------------------
// Reassign (PRD-132 Phase 4)
// ---------------------------------------------------------------------------

/// Request body for `POST /api/v1/admin/jobs/:id/reassign`.
#[derive(Debug, Deserialize)]
pub struct ReassignJobRequest {
    /// Target ComfyUI instance ID. `None` clears the assignment (auto-assign).
    pub target_instance_id: Option<DbId>,
}

/// POST /api/v1/admin/jobs/{id}/reassign
///
/// Reassign a dispatched or running job to a different ComfyUI instance.
/// If the job is running, interrupts the current instance first.
/// Resets the job to Pending so the dispatcher picks it up again.
pub async fn reassign_job(
    RequireAdmin(admin): RequireAdmin,
    State(state): State<AppState>,
    Path(job_id): Path<DbId>,
    Json(input): Json<ReassignJobRequest>,
) -> AppResult<impl IntoResponse> {
    let job = JobRepo::find_by_id(&state.pool, job_id)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "Job",
            id: job_id,
        }))?;

    // Only dispatched or running jobs can be reassigned.
    if job.status_id != JobStatus::Dispatched.id() && job.status_id != JobStatus::Running.id() {
        return Err(AppError::BadRequest(
            "Only dispatched or running jobs can be reassigned".into(),
        ));
    }

    // If running, interrupt on current instance.
    if job.status_id == JobStatus::Running.id() {
        if let Some(instance_id) = job.comfyui_instance_id {
            if let Err(e) = state.comfyui_manager.interrupt_instance(instance_id).await {
                tracing::warn!(
                    job_id,
                    instance_id,
                    error = %e,
                    "Failed to interrupt instance during reassignment",
                );
            }
        }
    }

    // Validate target instance exists if provided.
    if let Some(target_id) = input.target_instance_id {
        ComfyUIInstanceRepo::find_by_id(&state.pool, target_id)
            .await?
            .ok_or_else(|| {
                AppError::BadRequest(format!("ComfyUI instance {target_id} not found"))
            })?;
    }

    // Perform the reassignment.
    JobRepo::reassign(
        &state.pool,
        job_id,
        job.comfyui_instance_id,
        input.target_instance_id,
        admin.user_id,
    )
    .await?;

    tracing::info!(
        job_id,
        from_instance = ?job.comfyui_instance_id,
        to_instance = ?input.target_instance_id,
        admin_id = admin.user_id,
        "Job reassigned",
    );

    state.activity_broadcaster.publish(
        ActivityLogEntry::curated(
            ActivityLogLevel::Info,
            ActivityLogSource::Api,
            format!(
                "Job {job_id} reassigned: instance {:?} -> {:?}",
                job.comfyui_instance_id, input.target_instance_id
            ),
        )
        .with_user(admin.user_id)
        .with_job(job_id),
    );

    // Return the updated job.
    let updated = JobRepo::find_by_id(&state.pool, job_id).await?;
    Ok(Json(DataResponse { data: updated }))
}

// ---------------------------------------------------------------------------
// List ComfyUI Instances (PRD-132 Phase 4)
// ---------------------------------------------------------------------------

/// Instance summary with active job count for the reassignment UI.
#[derive(Debug, Serialize)]
pub struct InstanceWithJobCount {
    pub id: DbId,
    pub name: String,
    pub api_url: String,
    pub is_enabled: bool,
    pub drain_mode: bool,
    pub active_job_count: i64,
}

/// GET /api/v1/admin/comfyui/instances
///
/// Returns enabled ComfyUI instances with their active job counts.
/// Terminated/disabled instances are excluded.
pub async fn list_comfyui_instances(
    RequireAdmin(_admin): RequireAdmin,
    State(state): State<AppState>,
) -> AppResult<impl IntoResponse> {
    let instances = ComfyUIInstanceRepo::list_enabled(&state.pool).await?;

    let instance_ids: Vec<DbId> = instances.iter().map(|i| i.id).collect();
    let job_counts = JobRepo::active_jobs_by_instance(&state.pool, &instance_ids).await?;

    let result: Vec<InstanceWithJobCount> = instances
        .into_iter()
        .map(|inst| {
            let count = job_counts
                .iter()
                .find(|(id, _)| *id == inst.id)
                .map(|(_, c)| *c)
                .unwrap_or(0);
            InstanceWithJobCount {
                id: inst.id,
                name: inst.name,
                api_url: inst.api_url,
                is_enabled: inst.is_enabled,
                drain_mode: inst.drain_mode,
                active_job_count: count,
            }
        })
        .collect();

    Ok(Json(DataResponse { data: result }))
}

// ---------------------------------------------------------------------------
// Drain Mode (PRD-132 Phase 5)
// ---------------------------------------------------------------------------

/// Response for drain/undrain operations.
#[derive(Debug, Serialize)]
pub struct DrainModeResponse {
    pub instance_id: DbId,
    pub drain_mode: bool,
    pub active_job_count: i64,
}

/// POST /api/v1/admin/comfyui/{id}/drain
///
/// Enable drain mode on a ComfyUI instance. The instance finishes
/// current jobs but will not receive new ones.
pub async fn drain_instance(
    RequireAdmin(admin): RequireAdmin,
    State(state): State<AppState>,
    Path(instance_id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let updated = ComfyUIInstanceRepo::set_drain_mode(&state.pool, instance_id, true).await?;

    if !updated {
        return Err(AppError::Core(CoreError::NotFound {
            entity: "ComfyUIInstance",
            id: instance_id,
        }));
    }

    let active_count = ComfyUIInstanceRepo::count_active_jobs(&state.pool, instance_id).await?;

    tracing::info!(
        instance_id,
        active_jobs = active_count,
        admin_id = admin.user_id,
        "Instance drain mode enabled",
    );

    state.activity_broadcaster.publish(
        ActivityLogEntry::curated(
            ActivityLogLevel::Info,
            ActivityLogSource::Api,
            format!("Worker drain started (instance {instance_id}, {active_count} jobs remaining)"),
        )
        .with_user(admin.user_id)
        .with_entity("comfyui_instance", instance_id),
    );

    Ok(Json(DataResponse {
        data: DrainModeResponse {
            instance_id,
            drain_mode: true,
            active_job_count: active_count,
        },
    }))
}

/// POST /api/v1/admin/comfyui/{id}/undrain
///
/// Disable drain mode on a ComfyUI instance, allowing it to accept
/// new jobs again.
pub async fn undrain_instance(
    RequireAdmin(admin): RequireAdmin,
    State(state): State<AppState>,
    Path(instance_id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let updated = ComfyUIInstanceRepo::set_drain_mode(&state.pool, instance_id, false).await?;

    if !updated {
        return Err(AppError::Core(CoreError::NotFound {
            entity: "ComfyUIInstance",
            id: instance_id,
        }));
    }

    let active_count = ComfyUIInstanceRepo::count_active_jobs(&state.pool, instance_id).await?;

    tracing::info!(
        instance_id,
        admin_id = admin.user_id,
        "Instance drain mode disabled",
    );

    state.activity_broadcaster.publish(
        ActivityLogEntry::curated(
            ActivityLogLevel::Info,
            ActivityLogSource::Api,
            format!("Worker undrained (instance {instance_id})"),
        )
        .with_user(admin.user_id)
        .with_entity("comfyui_instance", instance_id),
    );

    Ok(Json(DataResponse {
        data: DrainModeResponse {
            instance_id,
            drain_mode: false,
            active_job_count: active_count,
        },
    }))
}

// ---------------------------------------------------------------------------
// Hold / Release (PRD-132 Phase 6)
// ---------------------------------------------------------------------------

/// POST /api/v1/admin/jobs/{id}/hold
///
/// Transition a Pending job to Held. Held jobs are skipped by the dispatcher.
pub async fn hold_job(
    RequireAdmin(admin): RequireAdmin,
    State(state): State<AppState>,
    Path(job_id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let job = JobRepo::transition_state(
        &state.pool,
        job_id,
        JobStatus::Held.id(),
        Some(admin.user_id),
        Some("Held by admin"),
    )
    .await
    .map_err(|e| AppError::BadRequest(e.to_string()))?;

    tracing::info!(job_id, admin_id = admin.user_id, "Job held");

    state.activity_broadcaster.publish(
        ActivityLogEntry::curated(
            ActivityLogLevel::Info,
            ActivityLogSource::Api,
            format!("Job {job_id} held by admin"),
        )
        .with_user(admin.user_id)
        .with_job(job_id),
    );

    Ok(Json(DataResponse { data: job }))
}

/// POST /api/v1/admin/jobs/{id}/release
///
/// Transition a Held job back to Pending so it can be dispatched.
pub async fn release_job(
    RequireAdmin(admin): RequireAdmin,
    State(state): State<AppState>,
    Path(job_id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let job = JobRepo::transition_state(
        &state.pool,
        job_id,
        JobStatus::Pending.id(),
        Some(admin.user_id),
        Some("Released by admin"),
    )
    .await
    .map_err(|e| AppError::BadRequest(e.to_string()))?;

    tracing::info!(job_id, admin_id = admin.user_id, "Job released");

    state.activity_broadcaster.publish(
        ActivityLogEntry::curated(
            ActivityLogLevel::Info,
            ActivityLogSource::Api,
            format!("Job {job_id} released by admin"),
        )
        .with_user(admin.user_id)
        .with_job(job_id),
    );

    Ok(Json(DataResponse { data: job }))
}

// ---------------------------------------------------------------------------
// Move to Front (PRD-132 Phase 6)
// ---------------------------------------------------------------------------

/// POST /api/v1/admin/jobs/{id}/move-to-front
///
/// Move a job to the front of the queue by setting its priority to
/// `min(current_priorities) - 1`.
pub async fn move_to_front(
    RequireAdmin(admin): RequireAdmin,
    State(state): State<AppState>,
    Path(job_id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    // Verify the job exists and is in a queue-eligible state.
    let job = JobRepo::find_by_id(&state.pool, job_id)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "Job",
            id: job_id,
        }))?;

    if job.status_id != JobStatus::Pending.id() && job.status_id != JobStatus::Held.id() {
        return Err(AppError::BadRequest(
            "Only pending or held jobs can be moved to the front".into(),
        ));
    }

    let min_priority = JobRepo::min_priority(&state.pool).await?;
    let new_priority = min_priority - 1;

    let updated = JobRepo::update_priority(&state.pool, job_id, new_priority).await?;

    tracing::info!(
        job_id,
        new_priority,
        admin_id = admin.user_id,
        "Job moved to front of queue",
    );

    state.activity_broadcaster.publish(
        ActivityLogEntry::curated(
            ActivityLogLevel::Info,
            ActivityLogSource::Api,
            format!("Job {job_id} moved to front (priority {new_priority})"),
        )
        .with_user(admin.user_id)
        .with_job(job_id),
    );

    Ok(Json(DataResponse { data: updated }))
}

// ---------------------------------------------------------------------------
// Bulk Cancel (PRD-132 Phase 6)
// ---------------------------------------------------------------------------

/// Request body for `POST /api/v1/admin/jobs/bulk-cancel`.
#[derive(Debug, Deserialize)]
pub struct BulkCancelRequest {
    pub filter: BulkCancelFilter,
}

/// Response for bulk cancel operations.
#[derive(Debug, Serialize)]
pub struct BulkCancelResponse {
    pub cancelled_count: u64,
}

/// POST /api/v1/admin/jobs/bulk-cancel
///
/// Cancel all non-terminal jobs matching the given filter criteria.
pub async fn bulk_cancel(
    RequireAdmin(admin): RequireAdmin,
    State(state): State<AppState>,
    Json(input): Json<BulkCancelRequest>,
) -> AppResult<impl IntoResponse> {
    let cancelled_count = JobRepo::bulk_cancel(&state.pool, &input.filter).await?;

    tracing::info!(
        cancelled_count,
        admin_id = admin.user_id,
        "Bulk cancel completed",
    );

    state.activity_broadcaster.publish(
        ActivityLogEntry::curated(
            ActivityLogLevel::Warn,
            ActivityLogSource::Api,
            format!("Bulk cancel: {cancelled_count} jobs cancelled by admin"),
        )
        .with_user(admin.user_id)
        .with_fields(serde_json::json!({ "cancelled_count": cancelled_count })),
    );

    Ok(Json(DataResponse {
        data: BulkCancelResponse { cancelled_count },
    }))
}

// ---------------------------------------------------------------------------
// Redistribute Queue (PRD-132 Phase 6)
// ---------------------------------------------------------------------------

/// Request body for `POST /api/v1/admin/jobs/redistribute`.
#[derive(Debug, Deserialize)]
pub struct RedistributeRequest {
    pub from_instance_id: DbId,
}

/// Response for redistribute operations.
#[derive(Debug, Serialize)]
pub struct RedistributeResponse {
    pub redistributed_count: u64,
}

/// POST /api/v1/admin/jobs/redistribute
///
/// Clear `comfyui_instance_id` on pending/held jobs assigned to the
/// specified instance, allowing the dispatcher to reassign them.
pub async fn redistribute(
    RequireAdmin(admin): RequireAdmin,
    State(state): State<AppState>,
    Json(input): Json<RedistributeRequest>,
) -> AppResult<impl IntoResponse> {
    let count = JobRepo::redistribute_from_instance(&state.pool, input.from_instance_id).await?;

    tracing::info!(
        from_instance_id = input.from_instance_id,
        redistributed_count = count,
        admin_id = admin.user_id,
        "Jobs redistributed",
    );

    state.activity_broadcaster.publish(
        ActivityLogEntry::curated(
            ActivityLogLevel::Info,
            ActivityLogSource::Api,
            format!(
                "Redistributed {count} jobs from instance {}",
                input.from_instance_id
            ),
        )
        .with_user(admin.user_id)
        .with_entity("comfyui_instance", input.from_instance_id),
    );

    Ok(Json(DataResponse {
        data: RedistributeResponse {
            redistributed_count: count,
        },
    }))
}

// ---------------------------------------------------------------------------
// Queue Statistics (PRD-132 Phase 7)
// ---------------------------------------------------------------------------

/// Per-worker load entry in queue statistics.
#[derive(Debug, Serialize)]
pub struct WorkerLoad {
    pub instance_id: DbId,
    pub active_jobs: i64,
}

/// Queue statistics response.
#[derive(Debug, Serialize)]
pub struct QueueStatsResponse {
    pub counts_by_status: Vec<StatusCount>,
    pub avg_wait_secs: Option<f64>,
    pub avg_execution_secs: Option<f64>,
    pub throughput_per_hour: i64,
    pub per_worker_load: Vec<WorkerLoad>,
}

/// Status count entry.
#[derive(Debug, Serialize)]
pub struct StatusCount {
    pub status_id: i16,
    pub count: i64,
}

/// GET /api/v1/admin/queue/stats
///
/// Returns aggregate queue statistics including counts per status,
/// average wait/execution times, throughput, and per-worker load.
pub async fn queue_stats(
    RequireAdmin(_admin): RequireAdmin,
    State(state): State<AppState>,
) -> AppResult<impl IntoResponse> {
    /// Number of recent jobs to consider for average calculations.
    const STATS_SAMPLE_SIZE: i64 = 100;

    let counts_by_status = JobRepo::counts_by_status(&state.pool).await?;
    let avg_wait = JobRepo::avg_wait_time_secs(&state.pool, STATS_SAMPLE_SIZE).await?;
    let avg_exec = JobRepo::avg_execution_time_secs(&state.pool, STATS_SAMPLE_SIZE).await?;
    let throughput = JobRepo::completed_in_last_hour(&state.pool).await?;
    let worker_load = JobRepo::per_worker_load(&state.pool).await?;

    Ok(Json(DataResponse {
        data: QueueStatsResponse {
            counts_by_status: counts_by_status
                .into_iter()
                .map(|(status_id, count)| StatusCount { status_id, count })
                .collect(),
            avg_wait_secs: avg_wait,
            avg_execution_secs: avg_exec,
            throughput_per_hour: throughput,
            per_worker_load: worker_load
                .into_iter()
                .map(|(instance_id, active_jobs)| WorkerLoad {
                    instance_id,
                    active_jobs,
                })
                .collect(),
        },
    }))
}

// ---------------------------------------------------------------------------
// Enhanced Queue List (PRD-132 Phase 7)
// ---------------------------------------------------------------------------

/// GET /api/v1/admin/queue/jobs
///
/// List all jobs with rich filtering for the admin queue view.
/// Supports filters: status_ids, instance_id, job_type, submitted_by,
/// sort_by, sort_dir, limit, offset.
pub async fn list_admin_queue(
    RequireAdmin(_admin): RequireAdmin,
    State(state): State<AppState>,
    Query(filter): Query<AdminQueueFilter>,
) -> AppResult<impl IntoResponse> {
    let jobs = JobRepo::list_admin_queue(&state.pool, &filter).await?;
    Ok(Json(DataResponse { data: jobs }))
}
