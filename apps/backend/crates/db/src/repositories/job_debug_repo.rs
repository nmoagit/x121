//! Repository for the `job_debug_state` table (PRD-34).
//!
//! Provides operations for managing mid-run debug state including
//! pause/resume, parameter modification, preview storage, and abort.

use sqlx::PgPool;
use trulience_core::types::DbId;

use crate::models::job_debug::JobDebugState;

/// Column list for `job_debug_state` queries.
const COLUMNS: &str = "\
    id, job_id, paused_at_step, modified_params, \
    intermediate_previews, abort_reason, created_at, updated_at";

/// Provides operations for job debug state.
pub struct JobDebugRepo;

impl JobDebugRepo {
    /// Find debug state for a specific job.
    pub async fn find_by_job_id(
        pool: &PgPool,
        job_id: DbId,
    ) -> Result<Option<JobDebugState>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM job_debug_state WHERE job_id = $1"
        );
        sqlx::query_as::<_, JobDebugState>(&query)
            .bind(job_id)
            .fetch_optional(pool)
            .await
    }

    /// Upsert a debug state row for a job.
    ///
    /// Creates a new row if none exists, or returns the existing one
    /// (updating `updated_at` via the trigger).
    pub async fn upsert(
        pool: &PgPool,
        job_id: DbId,
    ) -> Result<JobDebugState, sqlx::Error> {
        let query = format!(
            "INSERT INTO job_debug_state (job_id) \
             VALUES ($1) \
             ON CONFLICT (job_id) DO UPDATE SET \
                 updated_at = NOW() \
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, JobDebugState>(&query)
            .bind(job_id)
            .fetch_one(pool)
            .await
    }

    /// Set the paused-at step for a job.
    pub async fn update_pause_state(
        pool: &PgPool,
        job_id: DbId,
        step: i32,
    ) -> Result<JobDebugState, sqlx::Error> {
        let query = format!(
            "UPDATE job_debug_state \
             SET paused_at_step = $2 \
             WHERE job_id = $1 \
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, JobDebugState>(&query)
            .bind(job_id)
            .bind(step)
            .fetch_one(pool)
            .await
    }

    /// Replace the modified parameters for a job.
    pub async fn update_modified_params(
        pool: &PgPool,
        job_id: DbId,
        params: &serde_json::Value,
    ) -> Result<JobDebugState, sqlx::Error> {
        let query = format!(
            "UPDATE job_debug_state \
             SET modified_params = $2 \
             WHERE job_id = $1 \
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, JobDebugState>(&query)
            .bind(job_id)
            .bind(params)
            .fetch_one(pool)
            .await
    }

    /// Append a preview entry to the intermediate_previews JSONB array.
    ///
    /// Uses `jsonb_insert` to append to the end of the array.
    pub async fn add_preview(
        pool: &PgPool,
        job_id: DbId,
        preview_entry: &serde_json::Value,
    ) -> Result<JobDebugState, sqlx::Error> {
        let query = format!(
            "UPDATE job_debug_state \
             SET intermediate_previews = intermediate_previews || $2::jsonb \
             WHERE job_id = $1 \
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, JobDebugState>(&query)
            .bind(job_id)
            .bind(preview_entry)
            .fetch_one(pool)
            .await
    }

    /// Set the abort reason for a job.
    pub async fn set_abort_reason(
        pool: &PgPool,
        job_id: DbId,
        reason: &str,
    ) -> Result<JobDebugState, sqlx::Error> {
        let query = format!(
            "UPDATE job_debug_state \
             SET abort_reason = $2 \
             WHERE job_id = $1 \
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, JobDebugState>(&query)
            .bind(job_id)
            .bind(reason)
            .fetch_one(pool)
            .await
    }

    /// Clear the pause state (set `paused_at_step = NULL`) on resume.
    pub async fn clear_pause_state(
        pool: &PgPool,
        job_id: DbId,
    ) -> Result<JobDebugState, sqlx::Error> {
        let query = format!(
            "UPDATE job_debug_state \
             SET paused_at_step = NULL \
             WHERE job_id = $1 \
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, JobDebugState>(&query)
            .bind(job_id)
            .fetch_one(pool)
            .await
    }

    /// Delete debug state for a job (cleanup).
    ///
    /// Returns the number of rows deleted (0 or 1).
    pub async fn delete_by_job_id(
        pool: &PgPool,
        job_id: DbId,
    ) -> Result<u64, sqlx::Error> {
        let result = sqlx::query("DELETE FROM job_debug_state WHERE job_id = $1")
            .bind(job_id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected())
    }
}
