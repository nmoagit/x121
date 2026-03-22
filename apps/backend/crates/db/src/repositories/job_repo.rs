//! Repository for the `jobs` table (PRD-07, extended by PRD-08).
//!
//! Uses `JobStatus` enum from `models::status` for all status transitions.
//! No magic numbers — every status literal is a named constant.

use sqlx::PgPool;
use x121_core::scheduling::state_machine;
use x121_core::types::DbId;

use serde::{Deserialize, Deserializer};

use crate::models::job::{AdminQueueJob, Job, JobListQuery, QueuedJobView, SubmitJob};
use crate::models::status::{JobStatus, StatusId};

/// Deserialize a comma-separated string (e.g. `"1,2,5"`) into `Option<Vec<T>>`.
///
/// Handles both single values (`"2"`) and CSV (`"1,2,5"`), which
/// `serde_urlencoded` cannot do natively for `Vec<T>`.
fn csv_to_vec<'de, D, T>(deserializer: D) -> Result<Option<Vec<T>>, D::Error>
where
    D: Deserializer<'de>,
    T: std::str::FromStr,
    T::Err: std::fmt::Display,
{
    let opt: Option<String> = Option::deserialize(deserializer)?;
    match opt {
        None => Ok(None),
        Some(s) if s.is_empty() => Ok(None),
        Some(s) => {
            let items: Vec<T> = s
                .split(',')
                .map(|v| v.trim().parse::<T>().map_err(serde::de::Error::custom))
                .collect::<Result<_, _>>()?;
            Ok(Some(items))
        }
    }
}

/// Filter criteria for bulk-cancelling jobs (PRD-132 Phase 6).
///
/// Deserialized from JSON body — no custom deserializer needed.
#[derive(Debug, Default, Deserialize)]
pub struct BulkCancelFilter {
    pub scene_id: Option<DbId>,
    pub avatar_id: Option<DbId>,
    pub project_id: Option<DbId>,
    pub submitted_by: Option<DbId>,
    pub status_ids: Option<Vec<StatusId>>,
}

/// Filter criteria for the admin queue list (PRD-132 Phase 7, extended by PRD-139).
#[derive(Debug, Default, Deserialize)]
pub struct AdminQueueFilter {
    #[serde(default, deserialize_with = "csv_to_vec")]
    pub status_ids: Option<Vec<StatusId>>,
    pub instance_id: Option<DbId>,
    pub job_type: Option<String>,
    pub submitted_by: Option<DbId>,
    /// Filter by pipeline (PRD-139). JOINs through project to get pipeline_id.
    pub pipeline_id: Option<DbId>,
    pub sort_by: Option<String>,
    pub sort_dir: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

/// Column list for `jobs` queries (includes PRD-08 scheduling + PRD-28 diagnostics).
const COLUMNS: &str = "\
    id, job_type, status_id, submitted_by, worker_id, priority, \
    parameters, result, error_message, error_details, \
    progress_percent, progress_message, \
    submitted_at, claimed_at, started_at, completed_at, \
    estimated_duration_secs, actual_duration_secs, retry_of_job_id, \
    scheduled_start_at, is_off_peak_only, is_paused, paused_at, resumed_at, queue_position, \
    failure_stage_index, failure_stage_name, failure_diagnostics, \
    last_checkpoint_id, resumed_from_checkpoint_id, original_job_id, \
    comfyui_instance_id, orphan_retry_count, \
    created_at, updated_at";

/// Columns for the lightweight queue view.
const QUEUE_VIEW_COLUMNS: &str = "\
    id, job_type, priority, submitted_by, submitted_at, \
    queue_position, scheduled_start_at, is_off_peak_only, is_paused";

/// Maximum page size for job listing.
const MAX_LIMIT: i64 = 100;

/// Default page size for job listing.
const DEFAULT_LIMIT: i64 = 50;

/// Terminal statuses: completed, failed, cancelled.
const TERMINAL_STATUSES: [StatusId; 3] = [
    JobStatus::Completed as StatusId,
    JobStatus::Failed as StatusId,
    JobStatus::Cancelled as StatusId,
];

/// Provides CRUD operations for background jobs.
pub struct JobRepo;

impl JobRepo {
    /// Create a new job. If `scheduled_start_at` is provided, the job starts
    /// in `Scheduled` status; otherwise it starts as `Pending`.
    pub async fn submit(
        pool: &PgPool,
        user_id: DbId,
        input: &SubmitJob,
    ) -> Result<Job, sqlx::Error> {
        let initial_status = if input.scheduled_start_at.is_some() {
            JobStatus::Scheduled.id()
        } else {
            JobStatus::Pending.id()
        };

        let query = format!(
            "INSERT INTO jobs \
                 (job_type, status_id, submitted_by, priority, parameters, \
                  estimated_duration_secs, scheduled_start_at, is_off_peak_only) \
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8) \
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, Job>(&query)
            .bind(&input.job_type)
            .bind(initial_status)
            .bind(user_id)
            .bind(input.priority.unwrap_or(0))
            .bind(&input.parameters)
            .bind(input.estimated_duration_secs)
            .bind(input.scheduled_start_at)
            .bind(input.is_off_peak_only)
            .fetch_one(pool)
            .await
    }

    /// Validate and perform a state transition, logging it in `job_state_transitions`.
    ///
    /// Uses the state machine from `x121_core::scheduling` to validate.
    /// Returns `Err` if the transition is invalid or the job does not exist.
    pub async fn transition_state(
        pool: &PgPool,
        job_id: DbId,
        to_status_id: StatusId,
        triggered_by: Option<DbId>,
        reason: Option<&str>,
    ) -> Result<Job, sqlx::Error> {
        // 1. Get current job status.
        let job = Self::find_by_id(pool, job_id)
            .await?
            .ok_or(sqlx::Error::RowNotFound)?;

        // 2. Validate transition via core state machine.
        state_machine::validate_transition(job.status_id, to_status_id)
            .map_err(|msg| sqlx::Error::Protocol(msg))?;

        // 3. Build the SET clause — handle pause/resume side effects.
        let set_clause = if to_status_id == JobStatus::Paused.id() {
            "status_id = $2, is_paused = true, paused_at = NOW()"
        } else if job.status_id == JobStatus::Paused.id() {
            // Resuming from paused: clear pause flag, set resumed_at.
            "status_id = $2, is_paused = false, resumed_at = NOW()"
        } else {
            "status_id = $2"
        };

        let update_query =
            format!("UPDATE jobs SET {set_clause} WHERE id = $1 RETURNING {COLUMNS}");
        let updated = sqlx::query_as::<_, Job>(&update_query)
            .bind(job_id)
            .bind(to_status_id)
            .fetch_one(pool)
            .await?;

        // 4. Log the transition.
        sqlx::query(
            "INSERT INTO job_state_transitions \
                 (job_id, from_status_id, to_status_id, triggered_by, reason) \
             VALUES ($1, $2, $3, $4, $5)",
        )
        .bind(job_id)
        .bind(job.status_id)
        .bind(to_status_id)
        .bind(triggered_by)
        .bind(reason)
        .execute(pool)
        .await?;

        Ok(updated)
    }

    /// Atomically claim the next eligible pending job for a worker.
    ///
    /// Respects off-peak rules and pause flags.
    /// Uses `SELECT FOR UPDATE SKIP LOCKED` to prevent double-dispatch.
    pub async fn claim_next_scheduled(
        pool: &PgPool,
        worker_id: DbId,
        is_off_peak: bool,
    ) -> Result<Option<Job>, sqlx::Error> {
        let query = format!(
            "UPDATE jobs \
             SET worker_id = $1, claimed_at = NOW(), status_id = $2 \
             WHERE id = ( \
                 SELECT id FROM jobs \
                 WHERE status_id = $3 \
                   AND is_paused = false \
                   AND (is_off_peak_only = false OR $4 = true) \
                 ORDER BY priority DESC, submitted_at ASC \
                 LIMIT 1 \
                 FOR UPDATE SKIP LOCKED \
             ) \
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, Job>(&query)
            .bind(worker_id)
            .bind(JobStatus::Dispatched.id())
            .bind(JobStatus::Pending.id())
            .bind(is_off_peak)
            .fetch_optional(pool)
            .await
    }

    /// Atomically claim the next unclaimed pending job for a worker.
    ///
    /// Uses `SELECT FOR UPDATE SKIP LOCKED` to prevent double-dispatch
    /// when multiple dispatcher instances are running.
    pub async fn claim_next(pool: &PgPool, worker_id: DbId) -> Result<Option<Job>, sqlx::Error> {
        let query = format!(
            "UPDATE jobs \
             SET worker_id = $1, claimed_at = NOW(), status_id = $2 \
             WHERE id = ( \
                 SELECT id FROM jobs \
                 WHERE status_id = $3 AND claimed_at IS NULL \
                 ORDER BY priority DESC, submitted_at ASC \
                 LIMIT 1 \
                 FOR UPDATE SKIP LOCKED \
             ) \
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, Job>(&query)
            .bind(worker_id)
            .bind(JobStatus::Running.id())
            .bind(JobStatus::Pending.id())
            .fetch_optional(pool)
            .await
    }

    /// List the current queue: pending + scheduled jobs ordered by priority.
    pub async fn list_queue(pool: &PgPool) -> Result<Vec<QueuedJobView>, sqlx::Error> {
        let query = format!(
            "SELECT {QUEUE_VIEW_COLUMNS} FROM jobs \
             WHERE status_id IN ($1, $2) \
             ORDER BY priority DESC, submitted_at ASC"
        );
        sqlx::query_as::<_, QueuedJobView>(&query)
            .bind(JobStatus::Pending.id())
            .bind(JobStatus::Scheduled.id())
            .fetch_all(pool)
            .await
    }

    /// Count jobs in each queue-relevant status.
    pub async fn queue_counts(pool: &PgPool) -> Result<(i64, i64, i64), sqlx::Error> {
        let row: (i64, i64, i64) = sqlx::query_as(
            "SELECT \
                 COALESCE(SUM(CASE WHEN status_id = $1 THEN 1 ELSE 0 END), 0), \
                 COALESCE(SUM(CASE WHEN status_id = $2 THEN 1 ELSE 0 END), 0), \
                 COALESCE(SUM(CASE WHEN status_id = $3 THEN 1 ELSE 0 END), 0) \
             FROM jobs",
        )
        .bind(JobStatus::Pending.id())
        .bind(JobStatus::Running.id())
        .bind(JobStatus::Scheduled.id())
        .fetch_one(pool)
        .await?;
        Ok(row)
    }

    /// Compute average duration in seconds for completed jobs (for wait estimation).
    pub async fn avg_duration_secs(pool: &PgPool) -> Result<Option<f64>, sqlx::Error> {
        sqlx::query_scalar(
            "SELECT AVG(actual_duration_secs)::DOUBLE PRECISION FROM jobs WHERE status_id = $1 AND actual_duration_secs IS NOT NULL",
        )
        .bind(JobStatus::Completed.id())
        .fetch_one(pool)
        .await
    }

    /// Set `started_at` when a job begins actual execution (not just claimed).
    pub async fn mark_started(pool: &PgPool, job_id: DbId) -> Result<(), sqlx::Error> {
        sqlx::query("UPDATE jobs SET started_at = NOW(), status_id = $2 WHERE id = $1")
            .bind(job_id)
            .bind(JobStatus::Running.id())
            .execute(pool)
            .await?;
        Ok(())
    }

    /// Update progress percentage and optional message.
    pub async fn update_progress(
        pool: &PgPool,
        job_id: DbId,
        percent: i16,
        message: Option<&str>,
    ) -> Result<(), sqlx::Error> {
        sqlx::query("UPDATE jobs SET progress_percent = $2, progress_message = $3 WHERE id = $1")
            .bind(job_id)
            .bind(percent)
            .bind(message)
            .execute(pool)
            .await?;
        Ok(())
    }

    /// Mark a job as completed with its result payload.
    ///
    /// Sets `progress_percent` to 100 and computes `actual_duration_secs`
    /// from `started_at` to now.
    pub async fn complete(
        pool: &PgPool,
        job_id: DbId,
        result: &serde_json::Value,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(
            "UPDATE jobs \
             SET status_id = $2, result = $3, completed_at = NOW(), \
                 progress_percent = 100, \
                 actual_duration_secs = EXTRACT(EPOCH FROM NOW() - started_at)::INTEGER \
             WHERE id = $1",
        )
        .bind(job_id)
        .bind(JobStatus::Completed.id())
        .bind(result)
        .execute(pool)
        .await?;
        Ok(())
    }

    /// Mark a job as failed with an error message and optional details.
    ///
    /// No automatic retry is performed. The job stays in `Failed` status
    /// until the user explicitly retries via `POST /jobs/:id/retry`.
    pub async fn fail(
        pool: &PgPool,
        job_id: DbId,
        error: &str,
        details: Option<&serde_json::Value>,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(
            "UPDATE jobs \
             SET status_id = $2, error_message = $3, error_details = $4, \
                 completed_at = NOW(), \
                 actual_duration_secs = EXTRACT(EPOCH FROM \
                     COALESCE(NOW() - started_at, INTERVAL '0'))::INTEGER \
             WHERE id = $1",
        )
        .bind(job_id)
        .bind(JobStatus::Failed.id())
        .bind(error)
        .bind(details)
        .execute(pool)
        .await?;
        Ok(())
    }

    /// Cancel a job if it is not already in a terminal state.
    ///
    /// Returns `true` if the job was cancelled, `false` if it was already
    /// completed, failed, or cancelled.
    pub async fn cancel(pool: &PgPool, job_id: DbId) -> Result<bool, sqlx::Error> {
        let result = sqlx::query(
            "UPDATE jobs \
             SET status_id = $2, completed_at = NOW() \
             WHERE id = $1 AND status_id NOT IN ($3, $4, $5)",
        )
        .bind(job_id)
        .bind(JobStatus::Cancelled.id())
        .bind(TERMINAL_STATUSES[0])
        .bind(TERMINAL_STATUSES[1])
        .bind(TERMINAL_STATUSES[2])
        .execute(pool)
        .await?;
        Ok(result.rows_affected() > 0)
    }

    /// Create a new pending job from a failed job's parameters.
    ///
    /// The new job has `retry_of_job_id` pointing to the original.
    /// This is the ONLY way to retry a failed job. No automatic retries exist.
    pub async fn retry(pool: &PgPool, job_id: DbId, user_id: DbId) -> Result<Job, sqlx::Error> {
        let original = Self::find_by_id(pool, job_id)
            .await?
            .ok_or(sqlx::Error::RowNotFound)?;

        let query = format!(
            "INSERT INTO jobs \
                 (job_type, status_id, submitted_by, priority, parameters, \
                  estimated_duration_secs, retry_of_job_id) \
             VALUES ($1, $2, $3, $4, $5, $6, $7) \
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, Job>(&query)
            .bind(&original.job_type)
            .bind(JobStatus::Pending.id())
            .bind(user_id)
            .bind(original.priority)
            .bind(&original.parameters)
            .bind(original.estimated_duration_secs)
            .bind(job_id)
            .fetch_one(pool)
            .await
    }

    /// Create a new pending job that resumes from a checkpoint of a failed job (PRD-28).
    ///
    /// The new job is linked to the original via `original_job_id` and
    /// `resumed_from_checkpoint_id`. Parameters may be modified before resuming.
    pub async fn resume_from_checkpoint(
        pool: &PgPool,
        user_id: DbId,
        original: &Job,
        checkpoint_id: DbId,
        parameters: &serde_json::Value,
    ) -> Result<Job, sqlx::Error> {
        let query = format!(
            "INSERT INTO jobs \
                 (job_type, status_id, submitted_by, priority, parameters, \
                  estimated_duration_secs, original_job_id, resumed_from_checkpoint_id) \
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8) \
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, Job>(&query)
            .bind(&original.job_type)
            .bind(JobStatus::Pending.id())
            .bind(user_id)
            .bind(original.priority)
            .bind(parameters)
            .bind(original.estimated_duration_secs)
            .bind(original.id)
            .bind(checkpoint_id)
            .fetch_one(pool)
            .await
    }

    /// Count active (pending/dispatched/running) jobs per ComfyUI instance (PRD-132).
    ///
    /// Returns a Vec of `(instance_id, active_job_count)` pairs for the given instance IDs.
    /// Instances with zero active jobs are included with count 0.
    pub async fn active_jobs_by_instance(
        pool: &PgPool,
        instance_ids: &[DbId],
    ) -> Result<Vec<(DbId, i64)>, sqlx::Error> {
        if instance_ids.is_empty() {
            return Ok(Vec::new());
        }

        // Query counts for instances that have active jobs.
        let rows: Vec<(DbId, i64)> = sqlx::query_as(
            "SELECT comfyui_instance_id, COUNT(*) \
             FROM jobs \
             WHERE comfyui_instance_id = ANY($1) \
               AND status_id IN ($2, $3, $4) \
             GROUP BY comfyui_instance_id",
        )
        .bind(instance_ids)
        .bind(JobStatus::Pending.id())
        .bind(JobStatus::Dispatched.id())
        .bind(JobStatus::Running.id())
        .fetch_all(pool)
        .await?;

        // Build result including zero-count instances.
        let mut result: Vec<(DbId, i64)> = instance_ids.iter().map(|&id| (id, 0)).collect();
        for (instance_id, count) in rows {
            if let Some(entry) = result.iter_mut().find(|(id, _)| *id == instance_id) {
                entry.1 = count;
            }
        }

        Ok(result)
    }

    // -----------------------------------------------------------------------
    // Phase 6: Admin queue manipulation (PRD-132)
    // -----------------------------------------------------------------------

    /// Get the minimum priority across all non-terminal jobs.
    ///
    /// Used by `move-to-front` to set a priority lower than all others,
    /// ensuring the job is dispatched first.
    pub async fn min_priority(pool: &PgPool) -> Result<i32, sqlx::Error> {
        let min: Option<i32> = sqlx::query_scalar(
            "SELECT MIN(priority) FROM jobs \
             WHERE status_id NOT IN ($1, $2, $3)",
        )
        .bind(TERMINAL_STATUSES[0])
        .bind(TERMINAL_STATUSES[1])
        .bind(TERMINAL_STATUSES[2])
        .fetch_one(pool)
        .await?;
        Ok(min.unwrap_or(0))
    }

    /// Bulk-cancel jobs matching the given filter criteria.
    ///
    /// Only cancels non-terminal jobs. Returns the number of cancelled rows.
    pub async fn bulk_cancel(pool: &PgPool, filter: &BulkCancelFilter) -> Result<u64, sqlx::Error> {
        // Build dynamic WHERE clause.
        let mut conditions: Vec<String> = vec![
            // Always exclude terminal statuses.
            format!(
                "status_id NOT IN ({}, {}, {})",
                TERMINAL_STATUSES[0], TERMINAL_STATUSES[1], TERMINAL_STATUSES[2]
            ),
        ];
        let mut bind_idx: u32 = 2; // $1 is the cancelled status_id

        if filter.scene_id.is_some() {
            conditions.push(format!("(parameters->>'scene_id')::BIGINT = ${bind_idx}"));
            bind_idx += 1;
        }
        if filter.avatar_id.is_some() {
            conditions.push(format!(
                "(parameters->>'avatar_id')::BIGINT = ${bind_idx}"
            ));
            bind_idx += 1;
        }
        if filter.project_id.is_some() {
            conditions.push(format!("(parameters->>'project_id')::BIGINT = ${bind_idx}"));
            bind_idx += 1;
        }
        if filter.submitted_by.is_some() {
            conditions.push(format!("submitted_by = ${bind_idx}"));
            bind_idx += 1;
        }
        if let Some(ref status_ids) = filter.status_ids {
            if !status_ids.is_empty() {
                conditions.push(format!("status_id = ANY(${bind_idx})"));
                bind_idx += 1;
            }
        }
        let _ = bind_idx; // suppress unused warning

        let where_clause = conditions.join(" AND ");
        let query =
            format!("UPDATE jobs SET status_id = $1, completed_at = NOW() WHERE {where_clause}");

        let mut q = sqlx::query(&query).bind(JobStatus::Cancelled.id());

        if let Some(sid) = filter.scene_id {
            q = q.bind(sid);
        }
        if let Some(cid) = filter.avatar_id {
            q = q.bind(cid);
        }
        if let Some(pid) = filter.project_id {
            q = q.bind(pid);
        }
        if let Some(uid) = filter.submitted_by {
            q = q.bind(uid);
        }
        if let Some(ref status_ids) = filter.status_ids {
            if !status_ids.is_empty() {
                q = q.bind(status_ids);
            }
        }

        let result = q.execute(pool).await?;
        Ok(result.rows_affected())
    }

    /// List pending jobs that have not been assigned to a ComfyUI instance.
    ///
    /// These are jobs created when no instances were available. The dispatcher
    /// calls this periodically to retry them once an instance comes online.
    pub async fn list_pending_unassigned(pool: &PgPool) -> Result<Vec<Job>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM jobs \
             WHERE status_id = $1 \
               AND comfyui_instance_id IS NULL \
               AND is_paused = false \
             ORDER BY priority DESC, submitted_at ASC"
        );
        sqlx::query_as::<_, Job>(&query)
            .bind(JobStatus::Pending.id())
            .fetch_all(pool)
            .await
    }

    /// Clear instance assignments for pending/held jobs assigned to a specific instance.
    ///
    /// Used by `redistribute` to re-pool jobs from an instance being taken offline.
    pub async fn redistribute_from_instance(
        pool: &PgPool,
        instance_id: DbId,
    ) -> Result<u64, sqlx::Error> {
        let result = sqlx::query(
            "UPDATE jobs \
             SET comfyui_instance_id = NULL \
             WHERE comfyui_instance_id = $1 \
               AND status_id IN ($2, $3)",
        )
        .bind(instance_id)
        .bind(JobStatus::Pending.id())
        .bind(JobStatus::Held.id())
        .execute(pool)
        .await?;
        Ok(result.rows_affected())
    }

    /// Hold all pending jobs (set status to Held). Used by emergency stop to
    /// prevent jobs from being dispatched while infrastructure is down.
    pub async fn hold_all_pending(pool: &PgPool) -> Result<u64, sqlx::Error> {
        let result = sqlx::query(
            "UPDATE jobs SET status_id = $1 \
             WHERE status_id = $2",
        )
        .bind(JobStatus::Held.id())
        .bind(JobStatus::Pending.id())
        .execute(pool)
        .await?;
        Ok(result.rows_affected())
    }

    /// Release all held jobs back to pending. Used by resume processing to
    /// re-enable job dispatch after an emergency stop.
    pub async fn release_all_held(pool: &PgPool) -> Result<u64, sqlx::Error> {
        let result = sqlx::query(
            "UPDATE jobs SET status_id = $1 \
             WHERE status_id = $2",
        )
        .bind(JobStatus::Pending.id())
        .bind(JobStatus::Held.id())
        .execute(pool)
        .await?;
        Ok(result.rows_affected())
    }

    // -----------------------------------------------------------------------
    // Phase 7: Queue statistics (PRD-132)
    // -----------------------------------------------------------------------

    /// Count jobs grouped by status.
    pub async fn counts_by_status(pool: &PgPool) -> Result<Vec<(StatusId, i64)>, sqlx::Error> {
        sqlx::query_as("SELECT status_id, COUNT(*) FROM jobs GROUP BY status_id ORDER BY status_id")
            .fetch_all(pool)
            .await
    }

    /// Average wait time (submitted_at to started_at) in seconds for recently completed jobs.
    pub async fn avg_wait_time_secs(pool: &PgPool, limit: i64) -> Result<Option<f64>, sqlx::Error> {
        sqlx::query_scalar(
            "SELECT AVG(EXTRACT(EPOCH FROM started_at - submitted_at))::DOUBLE PRECISION \
             FROM ( \
                 SELECT started_at, submitted_at FROM jobs \
                 WHERE status_id = $1 AND started_at IS NOT NULL \
                 ORDER BY completed_at DESC LIMIT $2 \
             ) sub",
        )
        .bind(JobStatus::Completed.id())
        .bind(limit)
        .fetch_one(pool)
        .await
    }

    /// Average execution time (started_at to completed_at) in seconds for recently completed jobs.
    pub async fn avg_execution_time_secs(
        pool: &PgPool,
        limit: i64,
    ) -> Result<Option<f64>, sqlx::Error> {
        sqlx::query_scalar(
            "SELECT AVG(EXTRACT(EPOCH FROM completed_at - started_at))::DOUBLE PRECISION \
             FROM ( \
                 SELECT started_at, completed_at FROM jobs \
                 WHERE status_id = $1 AND started_at IS NOT NULL AND completed_at IS NOT NULL \
                 ORDER BY completed_at DESC LIMIT $2 \
             ) sub",
        )
        .bind(JobStatus::Completed.id())
        .bind(limit)
        .fetch_one(pool)
        .await
    }

    /// Count jobs completed in the last hour (throughput metric).
    pub async fn completed_in_last_hour(pool: &PgPool) -> Result<i64, sqlx::Error> {
        let count: Option<i64> = sqlx::query_scalar(
            "SELECT COUNT(*) FROM jobs \
             WHERE status_id = $1 AND completed_at >= NOW() - INTERVAL '1 hour'",
        )
        .bind(JobStatus::Completed.id())
        .fetch_one(pool)
        .await?;
        Ok(count.unwrap_or(0))
    }

    /// Count active jobs per ComfyUI instance (for per-worker load stats).
    ///
    /// Returns `(instance_id, count)` for all instances that have active jobs.
    pub async fn per_worker_load(pool: &PgPool) -> Result<Vec<(DbId, i64)>, sqlx::Error> {
        sqlx::query_as(
            "SELECT comfyui_instance_id, COUNT(*) \
             FROM jobs \
             WHERE comfyui_instance_id IS NOT NULL \
               AND status_id IN ($1, $2, $3) \
             GROUP BY comfyui_instance_id",
        )
        .bind(JobStatus::Pending.id())
        .bind(JobStatus::Dispatched.id())
        .bind(JobStatus::Running.id())
        .fetch_all(pool)
        .await
    }

    /// List all jobs with rich filtering for the admin queue view.
    ///
    /// Returns enriched [`AdminQueueJob`] rows that include resolved scene
    /// context (avatar name, scene type name, track name) and pipeline
    /// context (pipeline_id, pipeline_code) via LEFT JOINs.
    pub async fn list_admin_queue(
        pool: &PgPool,
        filter: &AdminQueueFilter,
    ) -> Result<Vec<AdminQueueJob>, sqlx::Error> {
        let limit = filter.limit.unwrap_or(DEFAULT_LIMIT).min(MAX_LIMIT);
        let offset = filter.offset.unwrap_or(0);

        let mut conditions: Vec<String> = Vec::new();
        let mut bind_idx: u32 = 1;

        if let Some(ref status_ids) = filter.status_ids {
            if !status_ids.is_empty() {
                conditions.push(format!("j.status_id = ANY(${bind_idx})"));
                bind_idx += 1;
            }
        }
        if filter.instance_id.is_some() {
            conditions.push(format!("j.comfyui_instance_id = ${bind_idx}"));
            bind_idx += 1;
        }
        if filter.job_type.is_some() {
            conditions.push(format!("j.job_type = ${bind_idx}"));
            bind_idx += 1;
        }
        if filter.submitted_by.is_some() {
            conditions.push(format!("j.submitted_by = ${bind_idx}"));
            bind_idx += 1;
        }
        if filter.pipeline_id.is_some() {
            conditions.push(format!("p.pipeline_id = ${bind_idx}"));
            bind_idx += 1;
        }

        let where_clause = if conditions.is_empty() {
            String::new()
        } else {
            format!("WHERE {}", conditions.join(" AND "))
        };

        // Determine sort column and direction.
        let sort_col = match filter.sort_by.as_deref() {
            Some("priority") => "j.priority",
            Some("status_id") => "j.status_id",
            Some("job_type") => "j.job_type",
            _ => "j.submitted_at",
        };
        let sort_dir = match filter.sort_dir.as_deref() {
            Some("asc") => "ASC",
            _ => "DESC",
        };

        // Prefix all job columns with j. for the aliased query.
        let j_columns = COLUMNS
            .split(", ")
            .map(|c| format!("j.{c}"))
            .collect::<Vec<_>>()
            .join(", ");

        let query = format!(
            "SELECT {j_columns}, \
                    s.id AS scene_id, \
                    COALESCE(s.avatar_id, (j.parameters->>'avatar_id')::BIGINT) AS avatar_id, \
                    ch.project_id, \
                    ch.name AS avatar_name, \
                    st.name AS scene_type_name, \
                    t.name AS track_name, \
                    CASE \
                      WHEN j.parameters->>'scene_id' IS NOT NULL THEN 'scene' \
                      WHEN j.parameters->>'source_variant_type' IS NOT NULL THEN 'image' \
                      ELSE 'other' \
                    END AS job_kind, \
                    j.parameters->>'source_variant_type' AS source_variant_type, \
                    j.parameters->>'target_variant_type' AS target_variant_type, \
                    p.pipeline_id, \
                    pl.code AS pipeline_code \
             FROM jobs j \
             LEFT JOIN scenes s ON s.id = (j.parameters->>'scene_id')::BIGINT \
             LEFT JOIN avatars ch ON ch.id = COALESCE(s.avatar_id, (j.parameters->>'avatar_id')::BIGINT) \
             LEFT JOIN scene_types st ON st.id = s.scene_type_id \
             LEFT JOIN tracks t ON t.id = s.track_id \
             LEFT JOIN projects p ON p.id = ch.project_id \
             LEFT JOIN pipelines pl ON pl.id = p.pipeline_id \
             {where_clause} \
             ORDER BY {sort_col} {sort_dir} \
             LIMIT ${bind_idx} OFFSET ${}",
            bind_idx + 1,
        );

        let mut q = sqlx::query_as::<_, AdminQueueJob>(&query);

        if let Some(ref status_ids) = filter.status_ids {
            if !status_ids.is_empty() {
                q = q.bind(status_ids);
            }
        }
        if let Some(iid) = filter.instance_id {
            q = q.bind(iid);
        }
        if let Some(ref jt) = filter.job_type {
            q = q.bind(jt);
        }
        if let Some(uid) = filter.submitted_by {
            q = q.bind(uid);
        }
        if let Some(pid) = filter.pipeline_id {
            q = q.bind(pid);
        }

        q = q.bind(limit).bind(offset);
        q.fetch_all(pool).await
    }

    /// Assign a ComfyUI instance to a job (PRD-132).
    ///
    /// Called when dispatching a job to a specific ComfyUI instance.
    pub async fn assign_instance(
        pool: &PgPool,
        job_id: DbId,
        instance_id: DbId,
    ) -> Result<(), sqlx::Error> {
        sqlx::query("UPDATE jobs SET comfyui_instance_id = $2 WHERE id = $1")
            .bind(job_id)
            .bind(instance_id)
            .execute(pool)
            .await?;
        Ok(())
    }

    /// Reassign a job to a different ComfyUI instance (PRD-132).
    ///
    /// Resets the job status to Pending, clears (or sets) the ComfyUI instance,
    /// and logs the transition with from/to instance IDs in the reason.
    pub async fn reassign(
        pool: &PgPool,
        job_id: DbId,
        from_instance_id: Option<DbId>,
        to_instance_id: Option<DbId>,
        triggered_by: DbId,
    ) -> Result<(), sqlx::Error> {
        // 1. Get current status for transition logging.
        let job = Self::find_by_id(pool, job_id)
            .await?
            .ok_or(sqlx::Error::RowNotFound)?;

        // 2. Reset to Pending and update instance assignment.
        let query = format!(
            "UPDATE jobs \
             SET status_id = $2, comfyui_instance_id = $3, \
                 worker_id = NULL, claimed_at = NULL, started_at = NULL \
             WHERE id = $1 \
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, Job>(&query)
            .bind(job_id)
            .bind(JobStatus::Pending.id())
            .bind(to_instance_id)
            .fetch_one(pool)
            .await?;

        // 3. Log the transition.
        let reason = format!(
            "Reassigned: instance {:?} -> {:?}",
            from_instance_id, to_instance_id
        );
        sqlx::query(
            "INSERT INTO job_state_transitions \
                 (job_id, from_status_id, to_status_id, triggered_by, reason) \
             VALUES ($1, $2, $3, $4, $5)",
        )
        .bind(job_id)
        .bind(job.status_id)
        .bind(JobStatus::Pending.id())
        .bind(Some(triggered_by))
        .bind(&reason)
        .execute(pool)
        .await?;

        Ok(())
    }

    /// Update priority for a job (admin reorder).
    pub async fn update_priority(
        pool: &PgPool,
        job_id: DbId,
        new_priority: i32,
    ) -> Result<Job, sqlx::Error> {
        let query = format!("UPDATE jobs SET priority = $2 WHERE id = $1 RETURNING {COLUMNS}");
        sqlx::query_as::<_, Job>(&query)
            .bind(job_id)
            .bind(new_priority)
            .fetch_one(pool)
            .await
    }

    /// Find a job by its ID.
    pub async fn find_by_id(pool: &PgPool, id: DbId) -> Result<Option<Job>, sqlx::Error> {
        let query = format!("SELECT {COLUMNS} FROM jobs WHERE id = $1");
        sqlx::query_as::<_, Job>(&query)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// List jobs for a specific user with optional status filter and pagination.
    pub async fn list_by_user(
        pool: &PgPool,
        user_id: DbId,
        params: &JobListQuery,
    ) -> Result<Vec<Job>, sqlx::Error> {
        Self::list_jobs(pool, Some(user_id), params).await
    }

    /// List all jobs (admin view) with optional status filter and pagination.
    pub async fn list_all(pool: &PgPool, params: &JobListQuery) -> Result<Vec<Job>, sqlx::Error> {
        Self::list_jobs(pool, None, params).await
    }

    /// Shared listing query builder. When `user_id` is `Some`, filters to
    /// that user's jobs; when `None`, returns all jobs (admin view).
    async fn list_jobs(
        pool: &PgPool,
        user_id: Option<DbId>,
        params: &JobListQuery,
    ) -> Result<Vec<Job>, sqlx::Error> {
        let limit = params.limit.unwrap_or(DEFAULT_LIMIT).min(MAX_LIMIT);
        let offset = params.offset.unwrap_or(0);

        // Build the WHERE clause and track the next bind parameter index.
        let mut conditions: Vec<String> = Vec::new();
        let mut bind_idx: u32 = 1;

        if user_id.is_some() {
            conditions.push(format!("submitted_by = ${bind_idx}"));
            bind_idx += 1;
        }

        if params.status_id.is_some() {
            conditions.push(format!("status_id = ${bind_idx}"));
            bind_idx += 1;
        }

        let where_clause = if conditions.is_empty() {
            String::new()
        } else {
            format!("WHERE {}", conditions.join(" AND "))
        };

        let query = format!(
            "SELECT {COLUMNS} FROM jobs \
             {where_clause} \
             ORDER BY submitted_at DESC \
             LIMIT ${bind_idx} OFFSET ${}",
            bind_idx + 1,
        );

        let mut q = sqlx::query_as::<_, Job>(&query);

        if let Some(uid) = user_id {
            q = q.bind(uid);
        }
        if let Some(sid) = params.status_id {
            q = q.bind(sid);
        }

        q = q.bind(limit).bind(offset);

        q.fetch_all(pool).await
    }
}
