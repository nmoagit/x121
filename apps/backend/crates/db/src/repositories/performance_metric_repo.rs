//! Repository for the `performance_metrics` table (PRD-41).

use sqlx::PgPool;
use trulience_core::types::{DbId, Timestamp};

use crate::models::performance_metric::{
    CreatePerformanceMetric, PerformanceMetric, PerformanceTrendPoint,
    WorkerPerformanceSummary, WorkflowPerformanceSummary,
};

/// Column list for `performance_metrics` SELECT queries.
const COLUMNS: &str = "\
    id, job_id, workflow_id, worker_id, project_id, character_id, scene_id, \
    time_per_frame_ms, total_gpu_time_ms, total_wall_time_ms, \
    vram_peak_mb, frame_count, \
    quality_scores_json, pipeline_stages_json, resolution_tier, \
    created_at";

/// Column list for INSERT (excludes auto-generated `id` and `created_at`).
const INSERT_COLUMNS: &str = "\
    job_id, workflow_id, worker_id, project_id, character_id, scene_id, \
    time_per_frame_ms, total_gpu_time_ms, total_wall_time_ms, \
    vram_peak_mb, frame_count, \
    quality_scores_json, pipeline_stages_json, resolution_tier";

/// Provides query operations for performance metrics.
pub struct PerformanceMetricRepo;

impl PerformanceMetricRepo {
    /// Insert a single performance metric.
    pub async fn insert(
        pool: &PgPool,
        metric: &CreatePerformanceMetric,
    ) -> Result<PerformanceMetric, sqlx::Error> {
        let query = format!(
            "INSERT INTO performance_metrics ({INSERT_COLUMNS}) \
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) \
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, PerformanceMetric>(&query)
            .bind(metric.job_id)
            .bind(metric.workflow_id)
            .bind(metric.worker_id)
            .bind(metric.project_id)
            .bind(metric.character_id)
            .bind(metric.scene_id)
            .bind(metric.time_per_frame_ms)
            .bind(metric.total_gpu_time_ms)
            .bind(metric.total_wall_time_ms)
            .bind(metric.vram_peak_mb)
            .bind(metric.frame_count)
            .bind(&metric.quality_scores_json)
            .bind(&metric.pipeline_stages_json)
            .bind(&metric.resolution_tier)
            .fetch_one(pool)
            .await
    }

    /// Get metrics for a specific job.
    pub async fn get_by_job(
        pool: &PgPool,
        job_id: DbId,
    ) -> Result<Option<PerformanceMetric>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM performance_metrics WHERE job_id = $1"
        );
        sqlx::query_as::<_, PerformanceMetric>(&query)
            .bind(job_id)
            .fetch_optional(pool)
            .await
    }

    /// Get metrics by workflow within a time range.
    pub async fn query_by_workflow(
        pool: &PgPool,
        workflow_id: DbId,
        from: Timestamp,
        to: Timestamp,
    ) -> Result<Vec<PerformanceMetric>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM performance_metrics \
             WHERE workflow_id = $1 AND created_at >= $2 AND created_at <= $3 \
             ORDER BY created_at DESC"
        );
        sqlx::query_as::<_, PerformanceMetric>(&query)
            .bind(workflow_id)
            .bind(from)
            .bind(to)
            .fetch_all(pool)
            .await
    }

    /// Get metrics by worker within a time range.
    pub async fn query_by_worker(
        pool: &PgPool,
        worker_id: DbId,
        from: Timestamp,
        to: Timestamp,
    ) -> Result<Vec<PerformanceMetric>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM performance_metrics \
             WHERE worker_id = $1 AND created_at >= $2 AND created_at <= $3 \
             ORDER BY created_at DESC"
        );
        sqlx::query_as::<_, PerformanceMetric>(&query)
            .bind(worker_id)
            .bind(from)
            .bind(to)
            .fetch_all(pool)
            .await
    }

    /// Get metrics within a time range, optionally filtered by project.
    pub async fn query_by_time_range(
        pool: &PgPool,
        from: Timestamp,
        to: Timestamp,
        project_id: Option<DbId>,
    ) -> Result<Vec<PerformanceMetric>, sqlx::Error> {
        let query = if project_id.is_some() {
            format!(
                "SELECT {COLUMNS} FROM performance_metrics \
                 WHERE created_at >= $1 AND created_at <= $2 AND project_id = $3 \
                 ORDER BY created_at DESC"
            )
        } else {
            format!(
                "SELECT {COLUMNS} FROM performance_metrics \
                 WHERE created_at >= $1 AND created_at <= $2 \
                 ORDER BY created_at DESC"
            )
        };
        let mut q = sqlx::query_as::<_, PerformanceMetric>(&query)
            .bind(from)
            .bind(to);
        if let Some(pid) = project_id {
            q = q.bind(pid);
        }
        q.fetch_all(pool).await
    }

    // -----------------------------------------------------------------------
    // Aggregation queries
    // -----------------------------------------------------------------------

    /// Aggregate metrics per workflow within a time range.
    pub async fn aggregate_by_workflow(
        pool: &PgPool,
        from: Timestamp,
        to: Timestamp,
        limit: i64,
        order_best: bool,
    ) -> Result<Vec<WorkflowPerformanceSummary>, sqlx::Error> {
        let order = if order_best { "ASC" } else { "DESC" };
        let query = format!(
            "SELECT \
                workflow_id, \
                AVG(time_per_frame_ms)::FLOAT8 AS avg_time_per_frame_ms, \
                PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY time_per_frame_ms)::FLOAT8 AS p95_time_per_frame_ms, \
                AVG(total_gpu_time_ms)::FLOAT8 AS avg_gpu_time_ms, \
                AVG(vram_peak_mb)::FLOAT8 AS avg_vram_peak_mb, \
                MAX(vram_peak_mb) AS max_vram_peak_mb, \
                AVG((quality_scores_json->>'likeness')::FLOAT8) AS avg_likeness_score, \
                COUNT(*)::BIGINT AS job_count, \
                SUM(frame_count)::BIGINT AS total_frames \
             FROM performance_metrics \
             WHERE created_at >= $1 AND created_at <= $2 \
               AND workflow_id IS NOT NULL \
             GROUP BY workflow_id \
             ORDER BY avg_time_per_frame_ms {order} NULLS LAST \
             LIMIT $3"
        );
        sqlx::query_as::<_, WorkflowPerformanceSummary>(&query)
            .bind(from)
            .bind(to)
            .bind(limit)
            .fetch_all(pool)
            .await
    }

    /// Aggregate metrics for specific workflow IDs (for comparison).
    pub async fn aggregate_for_workflows(
        pool: &PgPool,
        workflow_ids: &[DbId],
        from: Timestamp,
        to: Timestamp,
    ) -> Result<Vec<WorkflowPerformanceSummary>, sqlx::Error> {
        let query = format!(
            "SELECT \
                workflow_id, \
                AVG(time_per_frame_ms)::FLOAT8 AS avg_time_per_frame_ms, \
                PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY time_per_frame_ms)::FLOAT8 AS p95_time_per_frame_ms, \
                AVG(total_gpu_time_ms)::FLOAT8 AS avg_gpu_time_ms, \
                AVG(vram_peak_mb)::FLOAT8 AS avg_vram_peak_mb, \
                MAX(vram_peak_mb) AS max_vram_peak_mb, \
                AVG((quality_scores_json->>'likeness')::FLOAT8) AS avg_likeness_score, \
                COUNT(*)::BIGINT AS job_count, \
                SUM(frame_count)::BIGINT AS total_frames \
             FROM performance_metrics \
             WHERE created_at >= $1 AND created_at <= $2 \
               AND workflow_id = ANY($3) \
             GROUP BY workflow_id \
             ORDER BY workflow_id"
        );
        sqlx::query_as::<_, WorkflowPerformanceSummary>(&query)
            .bind(from)
            .bind(to)
            .bind(workflow_ids)
            .fetch_all(pool)
            .await
    }

    /// Aggregate metrics per worker within a time range.
    pub async fn aggregate_by_worker(
        pool: &PgPool,
        from: Timestamp,
        to: Timestamp,
    ) -> Result<Vec<WorkerPerformanceSummary>, sqlx::Error> {
        let query = "\
            SELECT \
                worker_id, \
                AVG(time_per_frame_ms)::FLOAT8 AS avg_time_per_frame_ms, \
                AVG(total_gpu_time_ms)::FLOAT8 AS avg_gpu_time_ms, \
                AVG(vram_peak_mb)::FLOAT8 AS avg_vram_peak_mb, \
                MAX(vram_peak_mb) AS max_vram_peak_mb, \
                COUNT(*)::BIGINT AS job_count, \
                SUM(total_gpu_time_ms)::BIGINT AS total_gpu_time_ms, \
                SUM(total_wall_time_ms)::BIGINT AS total_wall_time_ms \
            FROM performance_metrics \
            WHERE created_at >= $1 AND created_at <= $2 \
              AND worker_id IS NOT NULL \
            GROUP BY worker_id \
            ORDER BY avg_time_per_frame_ms ASC NULLS LAST";
        sqlx::query_as::<_, WorkerPerformanceSummary>(query)
            .bind(from)
            .bind(to)
            .fetch_all(pool)
            .await
    }

    /// Aggregate a single worker's metrics.
    pub async fn aggregate_single_worker(
        pool: &PgPool,
        worker_id: DbId,
        from: Timestamp,
        to: Timestamp,
    ) -> Result<Option<WorkerPerformanceSummary>, sqlx::Error> {
        let query = "\
            SELECT \
                worker_id, \
                AVG(time_per_frame_ms)::FLOAT8 AS avg_time_per_frame_ms, \
                AVG(total_gpu_time_ms)::FLOAT8 AS avg_gpu_time_ms, \
                AVG(vram_peak_mb)::FLOAT8 AS avg_vram_peak_mb, \
                MAX(vram_peak_mb) AS max_vram_peak_mb, \
                COUNT(*)::BIGINT AS job_count, \
                SUM(total_gpu_time_ms)::BIGINT AS total_gpu_time_ms, \
                SUM(total_wall_time_ms)::BIGINT AS total_wall_time_ms \
            FROM performance_metrics \
            WHERE worker_id = $1 AND created_at >= $2 AND created_at <= $3 \
            GROUP BY worker_id";
        sqlx::query_as::<_, WorkerPerformanceSummary>(query)
            .bind(worker_id)
            .bind(from)
            .bind(to)
            .fetch_optional(pool)
            .await
    }

    /// Time-series trend grouped by a given interval (day, week, month).
    ///
    /// `granularity` must be one of: `day`, `week`, `month`.
    pub async fn trend(
        pool: &PgPool,
        from: Timestamp,
        to: Timestamp,
        granularity: &str,
        workflow_id: Option<DbId>,
    ) -> Result<Vec<PerformanceTrendPoint>, sqlx::Error> {
        let workflow_clause = if workflow_id.is_some() {
            "AND workflow_id = $4"
        } else {
            ""
        };
        let query = format!(
            "SELECT \
                date_trunc($3, created_at) AS period, \
                AVG(time_per_frame_ms)::FLOAT8 AS avg_time_per_frame_ms, \
                AVG(total_gpu_time_ms)::FLOAT8 AS avg_gpu_time_ms, \
                AVG(vram_peak_mb)::FLOAT8 AS avg_vram_peak_mb, \
                AVG((quality_scores_json->>'likeness')::FLOAT8) AS avg_likeness_score, \
                COUNT(*)::BIGINT AS job_count \
             FROM performance_metrics \
             WHERE created_at >= $1 AND created_at <= $2 \
               {workflow_clause} \
             GROUP BY period \
             ORDER BY period"
        );
        let mut q = sqlx::query_as::<_, PerformanceTrendPoint>(&query)
            .bind(from)
            .bind(to)
            .bind(granularity);
        if let Some(wf_id) = workflow_id {
            q = q.bind(wf_id);
        }
        q.fetch_all(pool).await
    }

    /// Overview aggregation: total GPU hours, avg time-per-frame, peak VRAM,
    /// total jobs, total frames.
    pub async fn overview_aggregates(
        pool: &PgPool,
        from: Timestamp,
        to: Timestamp,
    ) -> Result<OverviewAggregates, sqlx::Error> {
        let query = "\
            SELECT \
                COALESCE(SUM(total_gpu_time_ms), 0)::BIGINT AS total_gpu_time_ms, \
                COALESCE(AVG(time_per_frame_ms), 0)::FLOAT8 AS avg_time_per_frame_ms, \
                COALESCE(MAX(vram_peak_mb), 0) AS peak_vram_mb, \
                COUNT(*)::BIGINT AS total_jobs, \
                COALESCE(SUM(frame_count), 0)::BIGINT AS total_frames \
            FROM performance_metrics \
            WHERE created_at >= $1 AND created_at <= $2";
        sqlx::query_as::<_, OverviewAggregates>(query)
            .bind(from)
            .bind(to)
            .fetch_one(pool)
            .await
    }
}

/// Raw aggregates returned by the overview query.
#[derive(Debug, Clone, sqlx::FromRow, serde::Serialize)]
pub struct OverviewAggregates {
    pub total_gpu_time_ms: i64,
    pub avg_time_per_frame_ms: f64,
    pub peak_vram_mb: i32,
    pub total_jobs: i64,
    pub total_frames: i64,
}
