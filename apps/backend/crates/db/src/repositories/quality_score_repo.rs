//! Repository for the `quality_scores` table (PRD-49).

use sqlx::PgPool;
use x121_core::types::DbId;

use crate::models::quality_score::{CreateQualityScore, QualityScore, SceneQaSummary};

/// Column list shared across queries to avoid repetition.
const COLUMNS: &str =
    "id, segment_id, check_type, score, status, details, threshold_used, created_at, updated_at";

/// Provides CRUD operations for quality scores.
pub struct QualityScoreRepo;

impl QualityScoreRepo {
    /// Insert a single quality score, returning the created row.
    pub async fn create(
        pool: &PgPool,
        body: &CreateQualityScore,
    ) -> Result<QualityScore, sqlx::Error> {
        let query = format!(
            "INSERT INTO quality_scores
                (segment_id, check_type, score, status, details, threshold_used)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, QualityScore>(&query)
            .bind(body.segment_id)
            .bind(&body.check_type)
            .bind(body.score)
            .bind(&body.status)
            .bind(&body.details)
            .bind(body.threshold_used)
            .fetch_one(pool)
            .await
    }

    /// Insert multiple quality scores in a single transaction.
    pub async fn create_batch(
        pool: &PgPool,
        scores: &[CreateQualityScore],
    ) -> Result<Vec<QualityScore>, sqlx::Error> {
        let mut results = Vec::with_capacity(scores.len());
        for s in scores {
            let row = Self::create(pool, s).await?;
            results.push(row);
        }
        Ok(results)
    }

    /// List all quality scores for a segment, ordered by check type.
    pub async fn find_by_segment(
        pool: &PgPool,
        segment_id: DbId,
    ) -> Result<Vec<QualityScore>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM quality_scores
             WHERE segment_id = $1
             ORDER BY check_type"
        );
        sqlx::query_as::<_, QualityScore>(&query)
            .bind(segment_id)
            .fetch_all(pool)
            .await
    }

    /// Find a quality score for a specific segment + check type combination.
    pub async fn find_by_segment_and_type(
        pool: &PgPool,
        segment_id: DbId,
        check_type: &str,
    ) -> Result<Option<QualityScore>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM quality_scores
             WHERE segment_id = $1 AND check_type = $2"
        );
        sqlx::query_as::<_, QualityScore>(&query)
            .bind(segment_id)
            .bind(check_type)
            .fetch_optional(pool)
            .await
    }

    /// Delete all quality scores for a segment (for re-running QA).
    pub async fn delete_by_segment(pool: &PgPool, segment_id: DbId) -> Result<(), sqlx::Error> {
        sqlx::query("DELETE FROM quality_scores WHERE segment_id = $1")
            .bind(segment_id)
            .execute(pool)
            .await?;
        Ok(())
    }

    /// Compute a scene-level QA summary by aggregating across all segments.
    ///
    /// Joins `segments` to `quality_scores` for the given scene, then counts
    /// per-segment failure/warning/pass status.
    pub async fn summary_by_scene(
        pool: &PgPool,
        scene_id: DbId,
    ) -> Result<SceneQaSummary, sqlx::Error> {
        // We use a CTE to get the "worst" status per segment, then aggregate.
        let row = sqlx::query_as::<_, SummaryRow>(
            "WITH segment_status AS (
                SELECT
                    s.id AS segment_id,
                    CASE
                        WHEN bool_or(qs.status = 'fail') THEN 'fail'
                        WHEN bool_or(qs.status = 'warn') THEN 'warn'
                        ELSE 'pass'
                    END AS worst_status
                FROM segments s
                LEFT JOIN quality_scores qs ON qs.segment_id = s.id
                WHERE s.scene_id = $1
                GROUP BY s.id
            )
            SELECT
                COUNT(*)::BIGINT AS total_segments,
                COALESCE(SUM(CASE WHEN worst_status = 'fail' THEN 1 ELSE 0 END), 0)::BIGINT AS segments_with_failures,
                COALESCE(SUM(CASE WHEN worst_status = 'warn' THEN 1 ELSE 0 END), 0)::BIGINT AS segments_with_warnings,
                COALESCE(SUM(CASE WHEN worst_status = 'pass' THEN 1 ELSE 0 END), 0)::BIGINT AS all_passed
            FROM segment_status",
        )
        .bind(scene_id)
        .fetch_one(pool)
        .await?;

        Ok(SceneQaSummary {
            scene_id,
            total_segments: row.total_segments as usize,
            segments_with_failures: row.segments_with_failures as usize,
            segments_with_warnings: row.segments_with_warnings as usize,
            all_passed: row.all_passed as usize,
        })
    }
}

/// Internal helper row for the scene summary aggregation query.
#[derive(sqlx::FromRow)]
struct SummaryRow {
    total_segments: i64,
    segments_with_failures: i64,
    segments_with_warnings: i64,
    all_passed: i64,
}
