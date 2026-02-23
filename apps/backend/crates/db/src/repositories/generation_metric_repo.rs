//! Repository for the `generation_metrics` table (PRD-61).
//!
//! Provides CRUD and upsert operations for calibration data used by the
//! cost & resource estimation engine.

use sqlx::PgPool;
use trulience_core::types::DbId;

use crate::models::generation_metric::{GenerationMetric, RecordMetricInput};

/// Column list for `generation_metrics` SELECT queries.
const COLUMNS: &str = "\
    id, workflow_id, resolution_tier_id, \
    avg_gpu_secs_per_segment, avg_disk_mb_per_segment, sample_count, \
    last_updated_at, created_at, updated_at";

/// Provides query operations for generation metrics.
pub struct GenerationMetricRepo;

impl GenerationMetricRepo {
    /// Find a metric record for a specific (workflow, resolution_tier) pair.
    pub async fn find_by_workflow_tier(
        pool: &PgPool,
        workflow_id: DbId,
        tier_id: DbId,
    ) -> Result<Option<GenerationMetric>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM generation_metrics \
             WHERE workflow_id = $1 AND resolution_tier_id = $2"
        );
        sqlx::query_as::<_, GenerationMetric>(&query)
            .bind(workflow_id)
            .bind(tier_id)
            .fetch_optional(pool)
            .await
    }

    /// List all metric records for a given workflow.
    pub async fn list_by_workflow(
        pool: &PgPool,
        workflow_id: DbId,
    ) -> Result<Vec<GenerationMetric>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM generation_metrics \
             WHERE workflow_id = $1 ORDER BY resolution_tier_id"
        );
        sqlx::query_as::<_, GenerationMetric>(&query)
            .bind(workflow_id)
            .fetch_all(pool)
            .await
    }

    /// List all metric records with pagination.
    pub async fn list_all(
        pool: &PgPool,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<GenerationMetric>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM generation_metrics \
             ORDER BY last_updated_at DESC \
             LIMIT $1 OFFSET $2"
        );
        sqlx::query_as::<_, GenerationMetric>(&query)
            .bind(limit)
            .bind(offset)
            .fetch_all(pool)
            .await
    }

    /// Upsert a metric observation using incremental mean.
    ///
    /// On first insert, stores the raw values with `sample_count = 1`.
    /// On conflict (same workflow + tier), updates the running averages
    /// using the incremental mean formula and increments the sample count.
    pub async fn upsert_metric(
        pool: &PgPool,
        input: &RecordMetricInput,
    ) -> Result<GenerationMetric, sqlx::Error> {
        let query = format!(
            "INSERT INTO generation_metrics \
                (workflow_id, resolution_tier_id, avg_gpu_secs_per_segment, \
                 avg_disk_mb_per_segment, sample_count, last_updated_at) \
             VALUES ($1, $2, $3, $4, 1, NOW()) \
             ON CONFLICT (workflow_id, resolution_tier_id) DO UPDATE SET \
                avg_gpu_secs_per_segment = generation_metrics.avg_gpu_secs_per_segment + \
                    ($3 - generation_metrics.avg_gpu_secs_per_segment) / (generation_metrics.sample_count + 1), \
                avg_disk_mb_per_segment = generation_metrics.avg_disk_mb_per_segment + \
                    ($4 - generation_metrics.avg_disk_mb_per_segment) / (generation_metrics.sample_count + 1), \
                sample_count = generation_metrics.sample_count + 1, \
                last_updated_at = NOW() \
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, GenerationMetric>(&query)
            .bind(input.workflow_id)
            .bind(input.resolution_tier_id)
            .bind(input.gpu_secs)
            .bind(input.disk_mb)
            .fetch_one(pool)
            .await
    }

    /// Batch-lookup metrics for a set of (workflow_id, resolution_tier_id) pairs.
    ///
    /// Returns all matching rows; callers match them to their inputs.
    pub async fn find_metrics_for_scenes(
        pool: &PgPool,
        workflow_tier_pairs: &[(DbId, DbId)],
    ) -> Result<Vec<GenerationMetric>, sqlx::Error> {
        if workflow_tier_pairs.is_empty() {
            return Ok(vec![]);
        }

        let workflow_ids: Vec<DbId> = workflow_tier_pairs.iter().map(|(w, _)| *w).collect();
        let tier_ids: Vec<DbId> = workflow_tier_pairs.iter().map(|(_, t)| *t).collect();

        let query = format!(
            "SELECT {COLUMNS} FROM generation_metrics \
             WHERE (workflow_id, resolution_tier_id) IN \
                (SELECT UNNEST($1::BIGINT[]), UNNEST($2::BIGINT[]))"
        );
        sqlx::query_as::<_, GenerationMetric>(&query)
            .bind(&workflow_ids)
            .bind(&tier_ids)
            .fetch_all(pool)
            .await
    }
}
