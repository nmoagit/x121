//! Repository for the `performance_alert_thresholds` table (PRD-41).

use sqlx::PgPool;
use trulience_core::types::DbId;

use crate::models::performance_metric::{
    CreateAlertThreshold, PerformanceAlertThreshold, UpdateAlertThreshold,
};

/// Column list for `performance_alert_thresholds` queries.
const COLUMNS: &str = "\
    id, metric_name, scope_type, scope_id, \
    warning_threshold, critical_threshold, enabled, \
    created_at, updated_at";

/// Column list for INSERT (excludes auto-generated columns).
const INSERT_COLUMNS: &str = "\
    metric_name, scope_type, scope_id, \
    warning_threshold, critical_threshold";

/// Provides CRUD operations for performance alert thresholds.
pub struct PerformanceAlertRepo;

impl PerformanceAlertRepo {
    /// List all thresholds, ordered by scope.
    pub async fn list_all(pool: &PgPool) -> Result<Vec<PerformanceAlertThreshold>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM performance_alert_thresholds \
             ORDER BY scope_type, scope_id NULLS FIRST, metric_name"
        );
        sqlx::query_as::<_, PerformanceAlertThreshold>(&query)
            .fetch_all(pool)
            .await
    }

    /// Get a single threshold by ID.
    pub async fn get_by_id(
        pool: &PgPool,
        id: DbId,
    ) -> Result<Option<PerformanceAlertThreshold>, sqlx::Error> {
        let query = format!("SELECT {COLUMNS} FROM performance_alert_thresholds WHERE id = $1");
        sqlx::query_as::<_, PerformanceAlertThreshold>(&query)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// Create a new threshold.
    pub async fn create(
        pool: &PgPool,
        dto: &CreateAlertThreshold,
    ) -> Result<PerformanceAlertThreshold, sqlx::Error> {
        let query = format!(
            "INSERT INTO performance_alert_thresholds ({INSERT_COLUMNS}) \
             VALUES ($1, $2, $3, $4, $5) \
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, PerformanceAlertThreshold>(&query)
            .bind(&dto.metric_name)
            .bind(&dto.scope_type)
            .bind(dto.scope_id)
            .bind(dto.warning_threshold)
            .bind(dto.critical_threshold)
            .fetch_one(pool)
            .await
    }

    /// Update a threshold.
    pub async fn update(
        pool: &PgPool,
        id: DbId,
        dto: &UpdateAlertThreshold,
    ) -> Result<Option<PerformanceAlertThreshold>, sqlx::Error> {
        let query = format!(
            "UPDATE performance_alert_thresholds SET \
                metric_name = COALESCE($2, metric_name), \
                scope_type = COALESCE($3, scope_type), \
                scope_id = CASE WHEN $4::BIGINT IS NOT NULL THEN $4 ELSE scope_id END, \
                warning_threshold = COALESCE($5, warning_threshold), \
                critical_threshold = COALESCE($6, critical_threshold), \
                enabled = COALESCE($7, enabled) \
             WHERE id = $1 \
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, PerformanceAlertThreshold>(&query)
            .bind(id)
            .bind(&dto.metric_name)
            .bind(&dto.scope_type)
            .bind(dto.scope_id)
            .bind(dto.warning_threshold)
            .bind(dto.critical_threshold)
            .bind(dto.enabled)
            .fetch_optional(pool)
            .await
    }

    /// Delete a threshold by ID. Returns true if a row was deleted.
    pub async fn delete(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error> {
        let result = sqlx::query("DELETE FROM performance_alert_thresholds WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected() > 0)
    }

    /// Get effective thresholds for a specific scope.
    ///
    /// Returns scope-specific thresholds first, then global fallbacks.
    pub async fn get_effective(
        pool: &PgPool,
        scope_type: &str,
        scope_id: Option<DbId>,
    ) -> Result<Vec<PerformanceAlertThreshold>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM performance_alert_thresholds \
             WHERE enabled = true AND (\
                (scope_type = $1 AND scope_id = $2) \
                OR scope_type = 'global'\
             ) \
             ORDER BY metric_name, scope_type DESC"
        );
        sqlx::query_as::<_, PerformanceAlertThreshold>(&query)
            .bind(scope_type)
            .bind(scope_id)
            .fetch_all(pool)
            .await
    }
}
