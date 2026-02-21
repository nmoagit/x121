//! Repository for the `jobs` table (PRD-07).
//!
//! Uses `JobStatus` enum from `models::status` for all status transitions.
//! No magic numbers — every status literal is a named constant.

use sqlx::PgPool;
use trulience_core::types::DbId;

use crate::models::job::{Job, JobListQuery, SubmitJob};
use crate::models::status::{JobStatus, StatusId};

/// Column list for `jobs` queries.
const COLUMNS: &str = "\
    id, job_type, status_id, submitted_by, worker_id, priority, \
    parameters, result, error_message, error_details, \
    progress_percent, progress_message, \
    submitted_at, claimed_at, started_at, completed_at, \
    estimated_duration_secs, actual_duration_secs, retry_of_job_id, \
    created_at, updated_at";

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
    /// Create a new pending job. Returns immediately with the job row.
    pub async fn submit(
        pool: &PgPool,
        user_id: DbId,
        input: &SubmitJob,
    ) -> Result<Job, sqlx::Error> {
        let query = format!(
            "INSERT INTO jobs (job_type, status_id, submitted_by, priority, parameters, estimated_duration_secs) \
             VALUES ($1, $2, $3, $4, $5, $6) \
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, Job>(&query)
            .bind(&input.job_type)
            .bind(JobStatus::Pending.id())
            .bind(user_id)
            .bind(input.priority.unwrap_or(0))
            .bind(&input.parameters)
            .bind(input.estimated_duration_secs)
            .fetch_one(pool)
            .await
    }

    /// Atomically claim the next unclaimed pending job for a worker.
    ///
    /// Uses `SELECT FOR UPDATE SKIP LOCKED` to prevent double-dispatch
    /// when multiple dispatcher instances are running.
    pub async fn claim_next(
        pool: &PgPool,
        worker_id: DbId,
    ) -> Result<Option<Job>, sqlx::Error> {
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

    /// Set `started_at` when a job begins actual execution (not just claimed).
    pub async fn mark_started(pool: &PgPool, job_id: DbId) -> Result<(), sqlx::Error> {
        sqlx::query(
            "UPDATE jobs SET started_at = NOW(), status_id = $2 WHERE id = $1",
        )
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
        sqlx::query(
            "UPDATE jobs SET progress_percent = $2, progress_message = $3 WHERE id = $1",
        )
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
    pub async fn retry(
        pool: &PgPool,
        job_id: DbId,
        user_id: DbId,
    ) -> Result<Job, sqlx::Error> {
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

    /// Find a job by its ID.
    pub async fn find_by_id(
        pool: &PgPool,
        id: DbId,
    ) -> Result<Option<Job>, sqlx::Error> {
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
    pub async fn list_all(
        pool: &PgPool,
        params: &JobListQuery,
    ) -> Result<Vec<Job>, sqlx::Error> {
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
