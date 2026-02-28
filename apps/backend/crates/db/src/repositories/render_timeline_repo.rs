//! Repository for the render queue timeline / Gantt view (PRD-90).
//!
//! Queries existing `jobs` and `workers` tables — no dedicated migration needed.
//! All methods are read-only projections.

use sqlx::PgPool;
use x121_core::job_status::{JOB_STATUS_ID_COMPLETED, JOB_STATUS_ID_RUNNING};

use crate::models::render_timeline::{TimelineJobRow, WorkerLaneRow};
use crate::models::status::WorkerStatus;

/// Column list for the timeline job projection.
const TIMELINE_JOB_COLUMNS: &str = "\
    j.id, j.worker_id, w.name AS worker_name, \
    j.status_id, j.priority, j.submitted_at, j.started_at, j.completed_at, \
    j.estimated_duration_secs, j.actual_duration_secs, \
    j.job_type, j.progress_percent";

/// Column list for the worker lane projection.
/// NOTE: Uses $1 bind parameter for JOB_STATUS_ID_RUNNING.
const WORKER_LANE_COLUMNS: &str = "\
    w.id, w.name, w.status_id, \
    (SELECT j.id FROM jobs j WHERE j.worker_id = w.id AND j.status_id = $1 \
     ORDER BY j.started_at DESC LIMIT 1) AS current_job_id";

/// Provides read-only queries for the render queue timeline.
pub struct RenderTimelineRepo;

impl RenderTimelineRepo {
    /// Fetch jobs within a time window for the timeline view.
    ///
    /// Includes a LEFT JOIN on `workers` for worker name display.
    /// Ordered by start time (started_at or submitted_at) ascending.
    pub async fn list_timeline_jobs(
        pool: &PgPool,
        from: chrono::DateTime<chrono::Utc>,
        to: chrono::DateTime<chrono::Utc>,
        limit: i64,
    ) -> Result<Vec<TimelineJobRow>, sqlx::Error> {
        let query = format!(
            "SELECT {TIMELINE_JOB_COLUMNS} \
             FROM jobs j \
             LEFT JOIN workers w ON w.id = j.worker_id \
             WHERE (j.started_at >= $1 AND j.started_at < $2) \
                OR (j.started_at IS NULL AND j.submitted_at >= $1 AND j.submitted_at < $2) \
                OR (j.started_at < $1 AND (j.completed_at IS NULL OR j.completed_at >= $1)) \
             ORDER BY COALESCE(j.started_at, j.submitted_at) ASC \
             LIMIT $3"
        );
        sqlx::query_as::<_, TimelineJobRow>(&query)
            .bind(from)
            .bind(to)
            .bind(limit)
            .fetch_all(pool)
            .await
    }

    /// Get the historical average job duration in seconds for estimation.
    ///
    /// Filters to completed jobs that have a recorded `actual_duration_secs`.
    /// Returns `None` if no completed jobs exist.
    pub async fn get_avg_duration(pool: &PgPool) -> Result<Option<f64>, sqlx::Error> {
        sqlx::query_scalar(
            "SELECT AVG(actual_duration_secs)::DOUBLE PRECISION \
             FROM jobs \
             WHERE status_id = $1 AND actual_duration_secs IS NOT NULL",
        )
        .bind(JOB_STATUS_ID_COMPLETED)
        .fetch_one(pool)
        .await
    }

    /// List active workers for the timeline lane headers.
    ///
    /// "Active" means enabled, approved, and not decommissioned.
    /// Each row includes the worker's current running job ID (if any).
    pub async fn list_active_workers(pool: &PgPool) -> Result<Vec<WorkerLaneRow>, sqlx::Error> {
        let query = format!(
            "SELECT {WORKER_LANE_COLUMNS} \
             FROM workers w \
             WHERE w.is_enabled = true \
               AND w.is_approved = true \
               AND w.decommissioned_at IS NULL \
             ORDER BY w.name ASC"
        );
        sqlx::query_as::<_, WorkerLaneRow>(&query)
            .bind(JOB_STATUS_ID_RUNNING) // $1 in WORKER_LANE_COLUMNS subquery
            .fetch_all(pool)
            .await
    }

    // NOTE: Job priority updates use `JobRepo::update_priority` from PRD-08.
    // No duplicate method here (DRY audit).

    /// Count active workers grouped by status for quick stats.
    pub async fn worker_status_counts(pool: &PgPool) -> Result<(i64, i64), sqlx::Error> {
        let row: (i64, i64) = sqlx::query_as(
            "SELECT \
                COALESCE(SUM(CASE WHEN status_id = $1 THEN 1 ELSE 0 END), 0), \
                COALESCE(SUM(CASE WHEN status_id = $2 THEN 1 ELSE 0 END), 0) \
             FROM workers \
             WHERE is_enabled = true AND is_approved = true AND decommissioned_at IS NULL",
        )
        .bind(WorkerStatus::Idle.id())
        .bind(WorkerStatus::Busy.id())
        .fetch_one(pool)
        .await?;
        Ok(row)
    }
}
