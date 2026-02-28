//! Repository for the `retry_attempts` table (PRD-71).

use sqlx::PgPool;
use x121_core::types::DbId;

use crate::models::retry_attempt::{CreateRetryAttempt, RetryAttempt, UpdateRetryAttempt};

/// Column list shared across queries to avoid repetition.
const COLUMNS: &str = "id, segment_id, attempt_number, seed, parameters, \
    original_parameters, output_video_path, quality_scores, overall_status, \
    is_selected, gpu_seconds, failure_reason, created_at, updated_at";

/// Provides CRUD operations for retry attempts.
pub struct RetryAttemptRepo;

impl RetryAttemptRepo {
    /// Insert a new retry attempt, returning the created row.
    pub async fn create(
        pool: &PgPool,
        input: &CreateRetryAttempt,
    ) -> Result<RetryAttempt, sqlx::Error> {
        let query = format!(
            "INSERT INTO retry_attempts
                (segment_id, attempt_number, seed, parameters, original_parameters)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, RetryAttempt>(&query)
            .bind(input.segment_id)
            .bind(input.attempt_number)
            .bind(input.seed)
            .bind(&input.parameters)
            .bind(&input.original_parameters)
            .fetch_one(pool)
            .await
    }

    /// Update a retry attempt. Only non-`None` fields in `input` are applied.
    ///
    /// Returns `None` if no row with the given `id` exists.
    pub async fn update(
        pool: &PgPool,
        id: DbId,
        input: &UpdateRetryAttempt,
    ) -> Result<Option<RetryAttempt>, sqlx::Error> {
        let query = format!(
            "UPDATE retry_attempts SET
                output_video_path = COALESCE($2, output_video_path),
                quality_scores = COALESCE($3, quality_scores),
                overall_status = COALESCE($4, overall_status),
                is_selected = COALESCE($5, is_selected),
                gpu_seconds = COALESCE($6, gpu_seconds),
                failure_reason = COALESCE($7, failure_reason)
             WHERE id = $1
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, RetryAttempt>(&query)
            .bind(id)
            .bind(&input.output_video_path)
            .bind(&input.quality_scores)
            .bind(&input.overall_status)
            .bind(input.is_selected)
            .bind(input.gpu_seconds)
            .bind(&input.failure_reason)
            .fetch_optional(pool)
            .await
    }

    /// List all retry attempts for a segment, ordered by attempt number.
    pub async fn list_by_segment(
        pool: &PgPool,
        segment_id: DbId,
    ) -> Result<Vec<RetryAttempt>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM retry_attempts
             WHERE segment_id = $1
             ORDER BY attempt_number ASC"
        );
        sqlx::query_as::<_, RetryAttempt>(&query)
            .bind(segment_id)
            .fetch_all(pool)
            .await
    }

    /// Find a single retry attempt by ID.
    pub async fn find_by_id(pool: &PgPool, id: DbId) -> Result<Option<RetryAttempt>, sqlx::Error> {
        let query = format!("SELECT {COLUMNS} FROM retry_attempts WHERE id = $1");
        sqlx::query_as::<_, RetryAttempt>(&query)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// Mark a retry attempt as the selected best-of-N result.
    ///
    /// Clears `is_selected` on all other attempts for the same segment,
    /// then sets `is_selected = true` and `overall_status = 'selected'`
    /// on the target attempt.
    pub async fn select_attempt(
        pool: &PgPool,
        id: DbId,
    ) -> Result<Option<RetryAttempt>, sqlx::Error> {
        // Clear any existing selection for the same segment.
        sqlx::query(
            "UPDATE retry_attempts SET is_selected = false
             WHERE segment_id = (SELECT segment_id FROM retry_attempts WHERE id = $1)",
        )
        .bind(id)
        .execute(pool)
        .await?;

        // Mark the target attempt as selected.
        let query = format!(
            "UPDATE retry_attempts
             SET is_selected = true, overall_status = 'selected'
             WHERE id = $1
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, RetryAttempt>(&query)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// Count retry attempts for a segment.
    pub async fn count_by_segment(pool: &PgPool, segment_id: DbId) -> Result<i64, sqlx::Error> {
        let row: (i64,) =
            sqlx::query_as("SELECT COUNT(*) FROM retry_attempts WHERE segment_id = $1")
                .bind(segment_id)
                .fetch_one(pool)
                .await?;
        Ok(row.0)
    }

    /// Sum of `gpu_seconds` for all retry attempts on a segment.
    ///
    /// Returns 0.0 if there are no attempts or all values are NULL.
    pub async fn gpu_seconds_total(pool: &PgPool, segment_id: DbId) -> Result<f64, sqlx::Error> {
        let row: (Option<f64>,) = sqlx::query_as(
            "SELECT COALESCE(SUM(gpu_seconds), 0) FROM retry_attempts WHERE segment_id = $1",
        )
        .bind(segment_id)
        .fetch_one(pool)
        .await?;
        Ok(row.0.unwrap_or(0.0))
    }
}
