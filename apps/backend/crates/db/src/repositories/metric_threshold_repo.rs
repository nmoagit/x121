//! Repository for the `metric_thresholds` table.

use sqlx::PgPool;
use x121_core::types::DbId;

use crate::models::hardware::{MetricThreshold, UpsertThreshold};

/// Column list for `metric_thresholds` queries.
const COLUMNS: &str = "\
    id, worker_id, metric_name, warning_value, critical_value, \
    is_enabled, created_at, updated_at";

/// Provides query operations for metric thresholds.
pub struct MetricThresholdRepo;

impl MetricThresholdRepo {
    /// List all thresholds (global and worker-specific).
    pub async fn list_all(pool: &PgPool) -> Result<Vec<MetricThreshold>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM metric_thresholds ORDER BY worker_id NULLS FIRST, metric_name"
        );
        sqlx::query_as::<_, MetricThreshold>(&query)
            .fetch_all(pool)
            .await
    }

    /// Get effective thresholds for a worker.
    ///
    /// Returns worker-specific thresholds first, then global defaults as
    /// fallback. Ordered so that worker-specific rows sort before globals
    /// (NULLS LAST) for the same metric name.
    pub async fn get_for_worker(
        pool: &PgPool,
        worker_id: DbId,
    ) -> Result<Vec<MetricThreshold>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM metric_thresholds \
             WHERE worker_id = $1 OR worker_id IS NULL \
             ORDER BY metric_name, worker_id NULLS LAST"
        );
        sqlx::query_as::<_, MetricThreshold>(&query)
            .bind(worker_id)
            .fetch_all(pool)
            .await
    }

    /// Upsert a threshold (uses the COALESCE unique index).
    ///
    /// If a threshold already exists for the same (worker_id, metric_name),
    /// the warning and critical values are updated.
    pub async fn upsert(
        pool: &PgPool,
        threshold: &UpsertThreshold,
    ) -> Result<MetricThreshold, sqlx::Error> {
        let query = format!(
            "INSERT INTO metric_thresholds (worker_id, metric_name, warning_value, critical_value) \
             VALUES ($1, $2, $3, $4) \
             ON CONFLICT (COALESCE(worker_id, 0), metric_name) \
             DO UPDATE SET \
                warning_value = EXCLUDED.warning_value, \
                critical_value = EXCLUDED.critical_value, \
                updated_at = NOW() \
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, MetricThreshold>(&query)
            .bind(threshold.worker_id)
            .bind(&threshold.metric_name)
            .bind(threshold.warning_value)
            .bind(threshold.critical_value)
            .fetch_one(pool)
            .await
    }
}
