//! Repository for the `gpu_metrics` table (append-only time-series).

use sqlx::PgPool;
use trulience_core::types::{DbId, Timestamp};

use crate::models::hardware::{CreateGpuMetric, GpuMetric, WorkerCurrentMetrics};

/// Column list for `gpu_metrics` SELECT queries (includes `id` and `created_at`).
const COLUMNS: &str = "\
    id, worker_id, gpu_index, \
    vram_used_mb, vram_total_mb, temperature_celsius, utilization_percent, \
    power_draw_watts, fan_speed_percent, \
    recorded_at, created_at";

/// Column list for `gpu_metrics` INSERT statements (excludes auto-generated `id` and `created_at`).
const INSERT_COLUMNS: &str = "\
    worker_id, gpu_index, vram_used_mb, vram_total_mb, \
    temperature_celsius, utilization_percent, \
    power_draw_watts, fan_speed_percent, recorded_at";

/// Provides query operations for GPU metrics.
pub struct GpuMetricRepo;

impl GpuMetricRepo {
    /// Insert a single GPU metric snapshot.
    pub async fn insert(
        pool: &PgPool,
        worker_id: DbId,
        metric: &CreateGpuMetric,
    ) -> Result<GpuMetric, sqlx::Error> {
        let query = format!(
            "INSERT INTO gpu_metrics ({INSERT_COLUMNS}) \
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) \
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, GpuMetric>(&query)
            .bind(worker_id)
            .bind(metric.gpu_index)
            .bind(metric.vram_used_mb)
            .bind(metric.vram_total_mb)
            .bind(metric.temperature_celsius)
            .bind(metric.utilization_percent)
            .bind(metric.power_draw_watts)
            .bind(metric.fan_speed_percent)
            .bind(metric.recorded_at)
            .fetch_one(pool)
            .await
    }

    /// Batch-insert GPU metrics from an agent push.
    ///
    /// Uses a single multi-row INSERT for efficiency.
    pub async fn insert_batch(
        pool: &PgPool,
        worker_id: DbId,
        metrics: &[CreateGpuMetric],
    ) -> Result<(), sqlx::Error> {
        if metrics.is_empty() {
            return Ok(());
        }

        // Build a multi-row VALUES clause.
        let mut query = format!("INSERT INTO gpu_metrics ({INSERT_COLUMNS}) VALUES ");

        let mut param_idx = 1u32;
        for (i, _) in metrics.iter().enumerate() {
            if i > 0 {
                query.push_str(", ");
            }
            query.push('(');
            for j in 0..9 {
                if j > 0 {
                    query.push_str(", ");
                }
                query.push('$');
                query.push_str(&param_idx.to_string());
                param_idx += 1;
            }
            query.push(')');
        }

        let mut q = sqlx::query(&query);
        for m in metrics {
            q = q
                .bind(worker_id)
                .bind(m.gpu_index)
                .bind(m.vram_used_mb)
                .bind(m.vram_total_mb)
                .bind(m.temperature_celsius)
                .bind(m.utilization_percent)
                .bind(m.power_draw_watts)
                .bind(m.fan_speed_percent)
                .bind(m.recorded_at);
        }

        q.execute(pool).await?;
        Ok(())
    }

    /// Get metrics for a worker within a time range.
    pub async fn get_for_worker(
        pool: &PgPool,
        worker_id: DbId,
        since: Timestamp,
    ) -> Result<Vec<GpuMetric>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM gpu_metrics \
             WHERE worker_id = $1 AND recorded_at >= $2 \
             ORDER BY recorded_at DESC"
        );
        sqlx::query_as::<_, GpuMetric>(&query)
            .bind(worker_id)
            .bind(since)
            .fetch_all(pool)
            .await
    }

    /// Get the latest metric snapshot per worker + GPU index.
    ///
    /// Uses `DISTINCT ON` to efficiently select the most recent row per
    /// (worker_id, gpu_index) combination.
    pub async fn get_latest_per_worker(
        pool: &PgPool,
    ) -> Result<Vec<WorkerCurrentMetrics>, sqlx::Error> {
        let query = "\
            SELECT DISTINCT ON (worker_id, gpu_index) \
                worker_id, gpu_index, \
                vram_used_mb, vram_total_mb, temperature_celsius, utilization_percent, \
                power_draw_watts, fan_speed_percent, recorded_at \
            FROM gpu_metrics \
            ORDER BY worker_id, gpu_index, recorded_at DESC";
        sqlx::query_as::<_, WorkerCurrentMetrics>(query)
            .fetch_all(pool)
            .await
    }

    /// Delete metrics older than the given cutoff timestamp.
    ///
    /// Returns the number of rows deleted.
    pub async fn delete_older_than(pool: &PgPool, cutoff: Timestamp) -> Result<u64, sqlx::Error> {
        let result = sqlx::query("DELETE FROM gpu_metrics WHERE recorded_at < $1")
            .bind(cutoff)
            .execute(pool)
            .await?;
        Ok(result.rows_affected())
    }
}
