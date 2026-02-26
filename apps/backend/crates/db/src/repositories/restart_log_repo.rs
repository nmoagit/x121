//! Repository for the `restart_logs` table.

use sqlx::PgPool;
use x121_core::types::{DbId, Timestamp};

use crate::models::hardware::{CreateRestartLog, RestartLog};

/// Column list for `restart_logs` queries.
const COLUMNS: &str = "\
    id, worker_id, service_name, initiated_by, status_id, \
    reason, started_at, completed_at, error_message, \
    created_at, updated_at";

/// Provides query operations for service restart logs.
pub struct RestartLogRepo;

impl RestartLogRepo {
    /// Create a new restart log entry with status "initiated".
    pub async fn create(pool: &PgPool, log: &CreateRestartLog) -> Result<RestartLog, sqlx::Error> {
        let query = format!(
            "INSERT INTO restart_logs (worker_id, service_name, initiated_by, reason) \
             VALUES ($1, $2, $3, $4) \
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, RestartLog>(&query)
            .bind(log.worker_id)
            .bind(&log.service_name)
            .bind(log.initiated_by)
            .bind(&log.reason)
            .fetch_one(pool)
            .await
    }

    /// Update the status of a restart log entry.
    ///
    /// Optionally sets `error_message` and `completed_at`.
    pub async fn update_status(
        pool: &PgPool,
        id: DbId,
        status_id: i16,
        error_message: Option<&str>,
        completed_at: Option<Timestamp>,
    ) -> Result<RestartLog, sqlx::Error> {
        let query = format!(
            "UPDATE restart_logs \
             SET status_id = $2, error_message = $3, completed_at = $4, updated_at = NOW() \
             WHERE id = $1 \
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, RestartLog>(&query)
            .bind(id)
            .bind(status_id)
            .bind(error_message)
            .bind(completed_at)
            .fetch_one(pool)
            .await
    }

    /// List restart logs for a specific worker, most recent first.
    pub async fn list_by_worker(
        pool: &PgPool,
        worker_id: DbId,
    ) -> Result<Vec<RestartLog>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM restart_logs \
             WHERE worker_id = $1 \
             ORDER BY created_at DESC"
        );
        sqlx::query_as::<_, RestartLog>(&query)
            .bind(worker_id)
            .fetch_all(pool)
            .await
    }
}
