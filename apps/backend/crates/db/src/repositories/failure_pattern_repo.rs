//! Repository for the `failure_patterns` table (PRD-64).

use sqlx::PgPool;
use trulience_core::search::{clamp_limit, clamp_offset, DEFAULT_SEARCH_LIMIT, MAX_SEARCH_LIMIT};
use trulience_core::types::DbId;

use crate::models::failure_pattern::{FailurePattern, UpsertFailurePattern};

/// Column list shared across queries to avoid repetition.
const COLUMNS: &str = "\
    id, pattern_key, description, \
    dimension_workflow_id, dimension_lora_id, dimension_character_id, \
    dimension_scene_type_id, dimension_segment_position, \
    failure_count, total_count, failure_rate, severity, \
    last_occurrence, created_at, updated_at";

/// Provides CRUD operations for failure patterns.
pub struct FailurePatternRepo;

impl FailurePatternRepo {
    /// Upsert a failure pattern.
    ///
    /// If a pattern with the same `pattern_key` already exists, updates the
    /// counts, rate, severity, and description. Otherwise creates a new row.
    pub async fn upsert(
        pool: &PgPool,
        input: &UpsertFailurePattern,
    ) -> Result<FailurePattern, sqlx::Error> {
        let query = format!(
            "INSERT INTO failure_patterns
                (pattern_key, description, dimension_workflow_id, dimension_lora_id,
                 dimension_character_id, dimension_scene_type_id, dimension_segment_position,
                 failure_count, total_count, failure_rate, severity, last_occurrence)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
             ON CONFLICT (pattern_key) DO UPDATE SET
                 description = COALESCE(EXCLUDED.description, failure_patterns.description),
                 failure_count = EXCLUDED.failure_count,
                 total_count = EXCLUDED.total_count,
                 failure_rate = EXCLUDED.failure_rate,
                 severity = EXCLUDED.severity,
                 last_occurrence = NOW()
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, FailurePattern>(&query)
            .bind(&input.pattern_key)
            .bind(&input.description)
            .bind(input.dimension_workflow_id)
            .bind(input.dimension_lora_id)
            .bind(input.dimension_character_id)
            .bind(input.dimension_scene_type_id)
            .bind(&input.dimension_segment_position)
            .bind(input.failure_count)
            .bind(input.total_count)
            .bind(input.failure_rate)
            .bind(&input.severity)
            .fetch_one(pool)
            .await
    }

    /// Find a single failure pattern by ID.
    pub async fn find_by_id(
        pool: &PgPool,
        id: DbId,
    ) -> Result<Option<FailurePattern>, sqlx::Error> {
        let query = format!("SELECT {COLUMNS} FROM failure_patterns WHERE id = $1");
        sqlx::query_as::<_, FailurePattern>(&query)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// List failure patterns with optional severity filter.
    ///
    /// Results are ordered by `failure_rate DESC` so the most problematic
    /// patterns appear first.
    pub async fn list(
        pool: &PgPool,
        limit: Option<i64>,
        offset: Option<i64>,
        severity_filter: Option<&str>,
    ) -> Result<Vec<FailurePattern>, sqlx::Error> {
        let limit = clamp_limit(limit, DEFAULT_SEARCH_LIMIT, MAX_SEARCH_LIMIT);
        let offset = clamp_offset(offset);

        if let Some(sev) = severity_filter {
            let query = format!(
                "SELECT {COLUMNS} FROM failure_patterns
                 WHERE severity = $1
                 ORDER BY failure_rate DESC
                 LIMIT $2 OFFSET $3"
            );
            sqlx::query_as::<_, FailurePattern>(&query)
                .bind(sev)
                .bind(limit)
                .bind(offset)
                .fetch_all(pool)
                .await
        } else {
            let query = format!(
                "SELECT {COLUMNS} FROM failure_patterns
                 ORDER BY failure_rate DESC
                 LIMIT $1 OFFSET $2"
            );
            sqlx::query_as::<_, FailurePattern>(&query)
                .bind(limit)
                .bind(offset)
                .fetch_all(pool)
                .await
        }
    }

    /// List failure patterns for a specific workflow.
    pub async fn list_by_workflow(
        pool: &PgPool,
        workflow_id: DbId,
    ) -> Result<Vec<FailurePattern>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM failure_patterns
             WHERE dimension_workflow_id = $1
             ORDER BY failure_rate DESC"
        );
        sqlx::query_as::<_, FailurePattern>(&query)
            .bind(workflow_id)
            .fetch_all(pool)
            .await
    }

    /// Get all failure patterns with dimension data for heatmap construction.
    ///
    /// The caller specifies which dimensions to use as row and column axes.
    /// Returns all patterns that have data for both requested dimensions.
    pub async fn get_heatmap_data(
        pool: &PgPool,
        row_dimension: &str,
        col_dimension: &str,
    ) -> Result<Vec<FailurePattern>, sqlx::Error> {
        // Build WHERE clause requiring both dimensions to be non-null.
        let row_col = dimension_column(row_dimension);
        let col_col = dimension_column(col_dimension);

        let query = format!(
            "SELECT {COLUMNS} FROM failure_patterns
             WHERE {row_col} IS NOT NULL AND {col_col} IS NOT NULL
             ORDER BY failure_rate DESC"
        );
        sqlx::query_as::<_, FailurePattern>(&query)
            .fetch_all(pool)
            .await
    }

    /// Get trend data for a specific pattern over time.
    ///
    /// Returns `(period_label, failure_rate, sample_count)` tuples aggregated
    /// by the requested period in days. Currently returns the pattern's
    /// current snapshot as a single data point (full time-series requires
    /// historical tracking table).
    pub async fn get_trend_data(
        pool: &PgPool,
        pattern_id: DbId,
        _period_days: i32,
    ) -> Result<Vec<(String, f64, i32)>, sqlx::Error> {
        // For now, return the current state as a single trend point.
        // A full implementation would query a historical snapshots table.
        let query = format!(
            "SELECT {COLUMNS} FROM failure_patterns WHERE id = $1"
        );
        let maybe = sqlx::query_as::<_, FailurePattern>(&query)
            .bind(pattern_id)
            .fetch_optional(pool)
            .await?;

        match maybe {
            Some(p) => {
                let label = p
                    .last_occurrence
                    .map(|ts| ts.format("%Y-%m-%d").to_string())
                    .unwrap_or_else(|| "current".to_string());
                Ok(vec![(label, p.failure_rate, p.total_count)])
            }
            None => Ok(vec![]),
        }
    }

    /// Delete a failure pattern by ID.
    pub async fn delete(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error> {
        let result = sqlx::query("DELETE FROM failure_patterns WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected() > 0)
    }
}

/// Map a dimension name to its SQL column name.
///
/// Falls back to `dimension_workflow_id` for unknown dimension names.
fn dimension_column(dimension: &str) -> &'static str {
    match dimension {
        "workflow" => "dimension_workflow_id",
        "lora" => "dimension_lora_id",
        "character" => "dimension_character_id",
        "scene_type" => "dimension_scene_type_id",
        "segment_position" => "dimension_segment_position",
        _ => "dimension_workflow_id",
    }
}
