//! Repository for the `script_executions` table (PRD-09).

use sqlx::PgPool;
use trulience_core::scripting::status::{
    EXECUTION_COMPLETED, EXECUTION_FAILED, EXECUTION_RUNNING, EXECUTION_TIMEOUT,
};
use trulience_core::types::DbId;

use crate::models::script::{CreateScriptExecution, ScriptExecution};

/// Column list for `script_executions` SELECT queries, including joined status name.
const COLUMNS: &str = "\
    se.id, se.script_id, se.job_id, se.triggered_by, \
    se.status_id, es.name AS status_name, \
    se.input_data, se.output_data, \
    se.stdout_log, se.stderr_log, \
    se.exit_code, se.duration_ms, se.error_message, \
    se.started_at, se.completed_at, \
    se.created_at, se.updated_at";

/// Join clause used in all read queries to include the execution status name.
const JOIN: &str = "\
    script_executions se \
    JOIN execution_statuses es ON se.status_id = es.id";

/// Provides query operations for script execution records.
pub struct ScriptExecutionRepo;

impl ScriptExecutionRepo {
    /// Create a new execution record with status `pending`.
    pub async fn create(
        pool: &PgPool,
        dto: &CreateScriptExecution,
    ) -> Result<ScriptExecution, sqlx::Error> {
        let id: DbId = sqlx::query_scalar(
            "INSERT INTO script_executions (script_id, job_id, triggered_by, input_data) \
             VALUES ($1, $2, $3, $4) \
             RETURNING id",
        )
        .bind(dto.script_id)
        .bind(dto.job_id)
        .bind(dto.triggered_by)
        .bind(&dto.input_data)
        .fetch_one(pool)
        .await?;

        Self::find_by_id(pool, id)
            .await?
            .ok_or(sqlx::Error::RowNotFound)
    }

    /// Transition an execution to `running` and record the start time.
    pub async fn mark_running(pool: &PgPool, id: DbId) -> Result<(), sqlx::Error> {
        sqlx::query(
            "UPDATE script_executions \
             SET status_id = $2, started_at = now() \
             WHERE id = $1",
        )
        .bind(id)
        .bind(EXECUTION_RUNNING)
        .execute(pool)
        .await?;

        Ok(())
    }

    /// Mark an execution as completed with full output details.
    pub async fn complete(
        pool: &PgPool,
        id: DbId,
        exit_code: i32,
        stdout_log: &str,
        stderr_log: &str,
        duration_ms: u64,
        output_data: Option<&serde_json::Value>,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(
            "UPDATE script_executions SET \
                status_id = $2, \
                exit_code = $3, \
                stdout_log = $4, \
                stderr_log = $5, \
                duration_ms = $6, \
                output_data = $7, \
                completed_at = now() \
             WHERE id = $1",
        )
        .bind(id)
        .bind(EXECUTION_COMPLETED)
        .bind(exit_code)
        .bind(stdout_log)
        .bind(stderr_log)
        .bind(duration_ms as i32)
        .bind(output_data)
        .execute(pool)
        .await?;

        Ok(())
    }

    /// Mark an execution as failed with an error message.
    pub async fn fail(pool: &PgPool, id: DbId, error_message: &str) -> Result<(), sqlx::Error> {
        sqlx::query(
            "UPDATE script_executions SET \
                status_id = $2, \
                error_message = $3, \
                completed_at = now() \
             WHERE id = $1",
        )
        .bind(id)
        .bind(EXECUTION_FAILED)
        .bind(error_message)
        .execute(pool)
        .await?;

        Ok(())
    }

    /// Mark an execution as timed out with the elapsed duration.
    pub async fn timeout(pool: &PgPool, id: DbId, elapsed_ms: u64) -> Result<(), sqlx::Error> {
        sqlx::query(
            "UPDATE script_executions SET \
                status_id = $2, \
                duration_ms = $3, \
                error_message = 'Execution timed out', \
                completed_at = now() \
             WHERE id = $1",
        )
        .bind(id)
        .bind(EXECUTION_TIMEOUT)
        .bind(elapsed_ms as i32)
        .execute(pool)
        .await?;

        Ok(())
    }

    /// Find an execution by its ID, including the joined status name.
    pub async fn find_by_id(
        pool: &PgPool,
        id: DbId,
    ) -> Result<Option<ScriptExecution>, sqlx::Error> {
        let query = format!("SELECT {COLUMNS} FROM {JOIN} WHERE se.id = $1");
        sqlx::query_as::<_, ScriptExecution>(&query)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// List executions for a specific script, ordered by most recent first.
    ///
    /// Results are paginated with `limit` and `offset`.
    pub async fn list_by_script(
        pool: &PgPool,
        script_id: DbId,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<ScriptExecution>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM {JOIN} \
             WHERE se.script_id = $1 \
             ORDER BY se.created_at DESC \
             LIMIT $2 OFFSET $3"
        );
        sqlx::query_as::<_, ScriptExecution>(&query)
            .bind(script_id)
            .bind(limit)
            .bind(offset)
            .fetch_all(pool)
            .await
    }
}
