//! Repository for segment versioning queries (PRD-25).
//!
//! Handles archiving old segment versions, staleness flagging,
//! version history retrieval, and boundary data lookups.

use sqlx::PgPool;
use trulience_core::types::DbId;

use crate::models::segment_version::{SegmentBoundaryData, SegmentVersionInfo};

/// Column list for versioning-related queries.
const VERSION_COLUMNS: &str = "id, scene_id, sequence_index, \
    previous_segment_id, regeneration_count, is_stale, \
    boundary_ssim_before, boundary_ssim_after, \
    created_at, updated_at";

/// Column list for boundary data queries.
const BOUNDARY_COLUMNS: &str = "id, scene_id, sequence_index, \
    seed_frame_path, last_frame_path, \
    boundary_ssim_before, boundary_ssim_after";

/// Versioning operations for segments.
pub struct SegmentVersionRepo;

impl SegmentVersionRepo {
    /// Archive a segment by setting `previous_segment_id` on a new segment,
    /// and incrementing the regeneration count.
    ///
    /// - `new_segment_id`: the freshly regenerated segment
    /// - `old_segment_id`: the previous version being replaced
    /// - `regeneration_count`: the new count value
    pub async fn archive_segment(
        pool: &PgPool,
        new_segment_id: DbId,
        old_segment_id: DbId,
        regeneration_count: i32,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(
            "UPDATE segments SET
                previous_segment_id = $2,
                regeneration_count = $3
             WHERE id = $1 AND deleted_at IS NULL"
        )
        .bind(new_segment_id)
        .bind(old_segment_id)
        .bind(regeneration_count)
        .execute(pool)
        .await?;
        Ok(())
    }

    /// Flag all segments in a scene after a given sequence index as stale.
    ///
    /// Returns the number of segments flagged.
    pub async fn flag_downstream_stale(
        pool: &PgPool,
        scene_id: DbId,
        from_sequence_index: i32,
    ) -> Result<u64, sqlx::Error> {
        let result = sqlx::query(
            "UPDATE segments SET is_stale = true
             WHERE scene_id = $1
               AND sequence_index > $2
               AND deleted_at IS NULL
               AND is_stale = false"
        )
        .bind(scene_id)
        .bind(from_sequence_index)
        .execute(pool)
        .await?;
        Ok(result.rows_affected())
    }

    /// Clear the stale flag on a single segment.
    pub async fn clear_stale_flag(pool: &PgPool, segment_id: DbId) -> Result<bool, sqlx::Error> {
        let result = sqlx::query(
            "UPDATE segments SET is_stale = false
             WHERE id = $1 AND deleted_at IS NULL AND is_stale = true"
        )
        .bind(segment_id)
        .execute(pool)
        .await?;
        Ok(result.rows_affected() > 0)
    }

    /// List all versions of a segment at the same position (same scene_id and
    /// sequence_index), ordered by creation time descending (newest first).
    pub async fn list_versions(
        pool: &PgPool,
        segment_id: DbId,
    ) -> Result<Vec<SegmentVersionInfo>, sqlx::Error> {
        // First get the scene_id and sequence_index from the given segment.
        let query = format!(
            "WITH target AS (
                SELECT scene_id, sequence_index FROM segments WHERE id = $1
             )
             SELECT {VERSION_COLUMNS} FROM segments
             WHERE scene_id = (SELECT scene_id FROM target)
               AND sequence_index = (SELECT sequence_index FROM target)
             ORDER BY created_at DESC"
        );
        sqlx::query_as::<_, SegmentVersionInfo>(&query)
            .bind(segment_id)
            .fetch_all(pool)
            .await
    }

    /// Get boundary data for a segment and its immediate neighbors.
    ///
    /// Returns up to 3 rows: the previous, current, and next segments.
    pub async fn get_boundary_data(
        pool: &PgPool,
        segment_id: DbId,
    ) -> Result<Vec<SegmentBoundaryData>, sqlx::Error> {
        let query = format!(
            "WITH target AS (
                SELECT scene_id, sequence_index FROM segments WHERE id = $1
             )
             SELECT {BOUNDARY_COLUMNS} FROM segments
             WHERE scene_id = (SELECT scene_id FROM target)
               AND sequence_index BETWEEN
                   (SELECT sequence_index FROM target) - 1
                   AND (SELECT sequence_index FROM target) + 1
               AND deleted_at IS NULL
             ORDER BY sequence_index ASC"
        );
        sqlx::query_as::<_, SegmentBoundaryData>(&query)
            .bind(segment_id)
            .fetch_all(pool)
            .await
    }

    /// Update the boundary SSIM scores for a segment.
    pub async fn update_boundary_ssim(
        pool: &PgPool,
        segment_id: DbId,
        before_ssim: Option<f64>,
        after_ssim: Option<f64>,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(
            "UPDATE segments SET
                boundary_ssim_before = COALESCE($2, boundary_ssim_before),
                boundary_ssim_after = COALESCE($3, boundary_ssim_after)
             WHERE id = $1 AND deleted_at IS NULL"
        )
        .bind(segment_id)
        .bind(before_ssim)
        .bind(after_ssim)
        .execute(pool)
        .await?;
        Ok(())
    }

    /// Get the total number of segments in a scene (for downstream impact estimation).
    pub async fn count_scene_segments(
        pool: &PgPool,
        scene_id: DbId,
    ) -> Result<i64, sqlx::Error> {
        let row: (i64,) = sqlx::query_as(
            "SELECT COUNT(*) FROM segments WHERE scene_id = $1 AND deleted_at IS NULL"
        )
        .bind(scene_id)
        .fetch_one(pool)
        .await?;
        Ok(row.0)
    }
}
