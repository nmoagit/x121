//! Repository for the `hook_execution_logs` table (PRD-77).

use sqlx::PgPool;
use trulience_core::types::DbId;

use crate::models::hook_execution_log::{CreateHookExecutionLog, HookExecutionLog};

/// Column list for hook_execution_logs queries.
const COLUMNS: &str = "id, hook_id, job_id, input_json, output_text, exit_code, \
    duration_ms, success, error_message, executed_at";

/// Provides data-access methods for hook execution logs.
pub struct HookExecutionLogRepo;

impl HookExecutionLogRepo {
    /// Record a new hook execution log entry.
    pub async fn create(
        pool: &PgPool,
        input: &CreateHookExecutionLog,
    ) -> Result<HookExecutionLog, sqlx::Error> {
        let query = format!(
            "INSERT INTO hook_execution_logs
                (hook_id, job_id, input_json, output_text, exit_code,
                 duration_ms, success, error_message)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, HookExecutionLog>(&query)
            .bind(input.hook_id)
            .bind(input.job_id)
            .bind(&input.input_json)
            .bind(&input.output_text)
            .bind(input.exit_code)
            .bind(input.duration_ms)
            .bind(input.success)
            .bind(&input.error_message)
            .fetch_one(pool)
            .await
    }

    /// List execution logs for a specific hook, newest first.
    pub async fn list_for_hook(
        pool: &PgPool,
        hook_id: DbId,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<HookExecutionLog>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM hook_execution_logs
             WHERE hook_id = $1
             ORDER BY executed_at DESC
             LIMIT $2 OFFSET $3"
        );
        sqlx::query_as::<_, HookExecutionLog>(&query)
            .bind(hook_id)
            .bind(limit)
            .bind(offset)
            .fetch_all(pool)
            .await
    }

    /// List execution logs for a specific job, oldest first (chronological).
    pub async fn list_for_job(
        pool: &PgPool,
        job_id: DbId,
    ) -> Result<Vec<HookExecutionLog>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM hook_execution_logs
             WHERE job_id = $1
             ORDER BY executed_at ASC"
        );
        sqlx::query_as::<_, HookExecutionLog>(&query)
            .bind(job_id)
            .fetch_all(pool)
            .await
    }

    /// Count execution logs for a specific hook.
    pub async fn count_for_hook(pool: &PgPool, hook_id: DbId) -> Result<i64, sqlx::Error> {
        let row: (i64,) =
            sqlx::query_as("SELECT COUNT(*) FROM hook_execution_logs WHERE hook_id = $1")
                .bind(hook_id)
                .fetch_one(pool)
                .await?;
        Ok(row.0)
    }
}
