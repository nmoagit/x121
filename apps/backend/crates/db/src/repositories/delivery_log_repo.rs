//! Repository for the `delivery_logs` table (PRD-39 Amendment A.3).

use sqlx::PgPool;
use x121_core::types::DbId;

use crate::models::delivery_log::{CreateDeliveryLog, DeliveryLog};

const COLUMNS: &str = "id, delivery_export_id, project_id, log_level, message, details, created_at";

/// Provides CRUD operations for project delivery logs.
///
/// Named `ProjectDeliveryLogRepo` to distinguish from the webhook
/// `DeliveryLogRepo` in `webhook_testing_repo`.
pub struct ProjectDeliveryLogRepo;

impl ProjectDeliveryLogRepo {
    /// List delivery logs for a project, optionally filtered by level.
    pub async fn list_for_project(
        pool: &PgPool,
        project_id: DbId,
        level_filter: Option<&str>,
        limit: i64,
    ) -> Result<Vec<DeliveryLog>, sqlx::Error> {
        if let Some(level) = level_filter {
            let query = format!(
                "SELECT {COLUMNS} FROM delivery_logs \
                 WHERE project_id = $1 AND log_level = $2 \
                 ORDER BY created_at DESC \
                 LIMIT $3"
            );
            sqlx::query_as::<_, DeliveryLog>(&query)
                .bind(project_id)
                .bind(level)
                .bind(limit)
                .fetch_all(pool)
                .await
        } else {
            let query = format!(
                "SELECT {COLUMNS} FROM delivery_logs \
                 WHERE project_id = $1 \
                 ORDER BY created_at DESC \
                 LIMIT $2"
            );
            sqlx::query_as::<_, DeliveryLog>(&query)
                .bind(project_id)
                .bind(limit)
                .fetch_all(pool)
                .await
        }
    }

    /// Insert a new delivery log entry.
    pub async fn create(
        pool: &PgPool,
        input: &CreateDeliveryLog,
    ) -> Result<DeliveryLog, sqlx::Error> {
        let query = format!(
            "INSERT INTO delivery_logs \
                (delivery_export_id, project_id, log_level, message, details) \
             VALUES ($1, $2, $3, $4, $5) \
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, DeliveryLog>(&query)
            .bind(input.delivery_export_id)
            .bind(input.project_id)
            .bind(&input.log_level)
            .bind(&input.message)
            .bind(&input.details)
            .fetch_one(pool)
            .await
    }

    /// Delete logs older than `days` days.
    pub async fn purge_old(pool: &PgPool, days: i32) -> Result<u64, sqlx::Error> {
        let result = sqlx::query(
            "DELETE FROM delivery_logs WHERE created_at < NOW() - make_interval(days => $1)",
        )
        .bind(days)
        .execute(pool)
        .await?;
        Ok(result.rows_affected())
    }
}
