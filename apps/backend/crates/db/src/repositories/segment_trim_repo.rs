//! Repository for the `segment_trims` table (PRD-78).

use sqlx::PgPool;
use trulience_core::types::DbId;

use crate::models::segment_trim::{CreateSegmentTrim, SegmentTrim};

/// Column list for segment_trims queries.
const COLUMNS: &str = "id, segment_id, original_path, trimmed_path, \
    in_frame, out_frame, total_original_frames, created_by, \
    created_at, updated_at";

/// Provides CRUD operations for segment trims.
pub struct SegmentTrimRepo;

impl SegmentTrimRepo {
    /// Insert a new segment trim, returning the created row.
    pub async fn create(
        pool: &PgPool,
        input: &CreateSegmentTrim,
    ) -> Result<SegmentTrim, sqlx::Error> {
        let query = format!(
            "INSERT INTO segment_trims
                (segment_id, original_path, in_frame, out_frame,
                 total_original_frames, created_by)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, SegmentTrim>(&query)
            .bind(input.segment_id)
            .bind(&input.original_path)
            .bind(input.in_frame)
            .bind(input.out_frame)
            .bind(input.total_original_frames)
            .bind(input.created_by)
            .fetch_one(pool)
            .await
    }

    /// Find a segment trim by its primary key.
    pub async fn find_by_id(
        pool: &PgPool,
        id: DbId,
    ) -> Result<Option<SegmentTrim>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM segment_trims WHERE id = $1"
        );
        sqlx::query_as::<_, SegmentTrim>(&query)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// Get the most recent (active) trim for a segment.
    pub async fn get_active_trim(
        pool: &PgPool,
        segment_id: DbId,
    ) -> Result<Option<SegmentTrim>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM segment_trims
             WHERE segment_id = $1
             ORDER BY created_at DESC
             LIMIT 1"
        );
        sqlx::query_as::<_, SegmentTrim>(&query)
            .bind(segment_id)
            .fetch_optional(pool)
            .await
    }

    /// List all trims for a segment, ordered by most recent first.
    pub async fn list_for_segment(
        pool: &PgPool,
        segment_id: DbId,
    ) -> Result<Vec<SegmentTrim>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM segment_trims
             WHERE segment_id = $1
             ORDER BY created_at DESC"
        );
        sqlx::query_as::<_, SegmentTrim>(&query)
            .bind(segment_id)
            .fetch_all(pool)
            .await
    }

    /// Update the trimmed output path after FFmpeg processing completes.
    pub async fn update_trimmed_path(
        pool: &PgPool,
        id: DbId,
        trimmed_path: &str,
    ) -> Result<bool, sqlx::Error> {
        let result = sqlx::query(
            "UPDATE segment_trims SET trimmed_path = $1 WHERE id = $2",
        )
        .bind(trimmed_path)
        .bind(id)
        .execute(pool)
        .await?;
        Ok(result.rows_affected() > 0)
    }

    /// Delete a single trim by ID (revert). Returns `true` if a row was deleted.
    pub async fn delete(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error> {
        let result = sqlx::query("DELETE FROM segment_trims WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected() > 0)
    }

    /// Delete all trims for a segment (full revert). Returns the count deleted.
    pub async fn delete_all_for_segment(
        pool: &PgPool,
        segment_id: DbId,
    ) -> Result<u64, sqlx::Error> {
        let result =
            sqlx::query("DELETE FROM segment_trims WHERE segment_id = $1")
                .bind(segment_id)
                .execute(pool)
                .await?;
        Ok(result.rows_affected())
    }

    /// Count trims for a given segment.
    pub async fn count_for_segment(
        pool: &PgPool,
        segment_id: DbId,
    ) -> Result<i64, sqlx::Error> {
        let row: (i64,) =
            sqlx::query_as("SELECT COUNT(*) FROM segment_trims WHERE segment_id = $1")
                .bind(segment_id)
                .fetch_one(pool)
                .await?;
        Ok(row.0)
    }
}
