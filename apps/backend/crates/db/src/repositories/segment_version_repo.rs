//! Repository for segment versioning queries (PRD-25).
//!
//! Handles archiving old segment versions, staleness flagging,
//! version history retrieval, and boundary data lookups.

use sqlx::PgPool;
use x121_core::types::DbId;

use crate::models::segment_version::{
    CreateSegmentVersion, SegmentBoundaryData, SegmentVersion, SegmentVersionInfo,
};

/// Column list for versioning-related queries.
const VERSION_COLUMNS: &str = "id, scene_id, sequence_index, \
    previous_segment_id, regeneration_count, is_stale, \
    boundary_ssim_before, boundary_ssim_after, \
    created_at, updated_at";

/// Column list for boundary data queries.
const BOUNDARY_COLUMNS: &str = "id, scene_id, sequence_index, \
    seed_frame_path, last_frame_path, \
    boundary_ssim_before, boundary_ssim_after";

/// Column list for `segment_versions` table queries (PRD-101).
const SV_COLUMNS: &str = "id, segment_id, version_number, video_path, thumbnail_path, \
    qa_scores_json, params_json, selected, created_by, created_at, updated_at";

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
             WHERE id = $1 AND deleted_at IS NULL",
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
               AND is_stale = false",
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
             WHERE id = $1 AND deleted_at IS NULL AND is_stale = true",
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
             WHERE id = $1 AND deleted_at IS NULL",
        )
        .bind(segment_id)
        .bind(before_ssim)
        .bind(after_ssim)
        .execute(pool)
        .await?;
        Ok(())
    }

    /// Get the total number of segments in a scene (for downstream impact estimation).
    pub async fn count_scene_segments(pool: &PgPool, scene_id: DbId) -> Result<i64, sqlx::Error> {
        let row: (i64,) = sqlx::query_as(
            "SELECT COUNT(*) FROM segments WHERE scene_id = $1 AND deleted_at IS NULL",
        )
        .bind(scene_id)
        .fetch_one(pool)
        .await?;
        Ok(row.0)
    }

    // -----------------------------------------------------------------------
    // PRD-101: Segment version CRUD (segment_versions table)
    // -----------------------------------------------------------------------

    /// Create a new version for a segment.
    ///
    /// Automatically calculates the next version number, marks it as
    /// selected, and unmarks any previously selected version.
    pub async fn create_version(
        pool: &PgPool,
        input: &CreateSegmentVersion,
        created_by: DbId,
    ) -> Result<SegmentVersion, sqlx::Error> {
        // Unmark the currently selected version (if any).
        sqlx::query("UPDATE segment_versions SET selected = FALSE WHERE segment_id = $1 AND selected = TRUE")
            .bind(input.segment_id)
            .execute(pool)
            .await?;

        let query = format!(
            "INSERT INTO segment_versions (
                segment_id, version_number, video_path, thumbnail_path,
                qa_scores_json, params_json, selected, created_by
             )
             VALUES (
                $1,
                COALESCE((SELECT MAX(version_number) FROM segment_versions WHERE segment_id = $1), 0) + 1,
                $2, $3, $4, $5, TRUE, $6
             )
             RETURNING {SV_COLUMNS}"
        );

        sqlx::query_as::<_, SegmentVersion>(&query)
            .bind(input.segment_id)
            .bind(&input.video_path)
            .bind(&input.thumbnail_path)
            .bind(&input.qa_scores_json)
            .bind(&input.params_json)
            .bind(created_by)
            .fetch_one(pool)
            .await
    }

    /// List all versions for a segment, ordered by version number descending.
    pub async fn get_version_history(
        pool: &PgPool,
        segment_id: DbId,
    ) -> Result<Vec<SegmentVersion>, sqlx::Error> {
        let query = format!(
            "SELECT {SV_COLUMNS} FROM segment_versions \
             WHERE segment_id = $1 \
             ORDER BY version_number DESC"
        );
        sqlx::query_as::<_, SegmentVersion>(&query)
            .bind(segment_id)
            .fetch_all(pool)
            .await
    }

    /// Get the currently selected version for a segment.
    pub async fn get_selected_version(
        pool: &PgPool,
        segment_id: DbId,
    ) -> Result<Option<SegmentVersion>, sqlx::Error> {
        let query = format!(
            "SELECT {SV_COLUMNS} FROM segment_versions \
             WHERE segment_id = $1 AND selected = TRUE"
        );
        sqlx::query_as::<_, SegmentVersion>(&query)
            .bind(segment_id)
            .fetch_optional(pool)
            .await
    }

    /// Mark a specific version as selected, unmarking all others for that segment.
    ///
    /// Returns `true` if the version was found and marked, `false` otherwise.
    pub async fn select_version(
        pool: &PgPool,
        segment_id: DbId,
        version_id: DbId,
    ) -> Result<bool, sqlx::Error> {
        // Unmark all versions for this segment.
        sqlx::query("UPDATE segment_versions SET selected = FALSE WHERE segment_id = $1")
            .bind(segment_id)
            .execute(pool)
            .await?;

        // Mark the specified version.
        let result = sqlx::query(
            "UPDATE segment_versions SET selected = TRUE \
             WHERE id = $1 AND segment_id = $2",
        )
        .bind(version_id)
        .bind(segment_id)
        .execute(pool)
        .await?;

        Ok(result.rows_affected() > 0)
    }

    /// Find a single version by its ID.
    pub async fn find_version_by_id(
        pool: &PgPool,
        version_id: DbId,
    ) -> Result<Option<SegmentVersion>, sqlx::Error> {
        let query = format!("SELECT {SV_COLUMNS} FROM segment_versions WHERE id = $1");
        sqlx::query_as::<_, SegmentVersion>(&query)
            .bind(version_id)
            .fetch_optional(pool)
            .await
    }

    /// Fetch two specific versions by version number for comparison.
    ///
    /// Returns `None` if either version does not exist. The first element
    /// is the lower version number (old), the second is the higher (new).
    pub async fn get_comparison_pair(
        pool: &PgPool,
        segment_id: DbId,
        v1: i32,
        v2: i32,
    ) -> Result<Option<(SegmentVersion, SegmentVersion)>, sqlx::Error> {
        let query = format!(
            "SELECT {SV_COLUMNS} FROM segment_versions \
             WHERE segment_id = $1 AND version_number IN ($2, $3) \
             ORDER BY version_number ASC"
        );
        let rows = sqlx::query_as::<_, SegmentVersion>(&query)
            .bind(segment_id)
            .bind(v1)
            .bind(v2)
            .fetch_all(pool)
            .await?;

        if rows.len() == 2 {
            // rows is sorted by version_number ASC.
            let mut iter = rows.into_iter();
            let first = iter.next().expect("checked length");
            let second = iter.next().expect("checked length");
            Ok(Some((first, second)))
        } else {
            Ok(None)
        }
    }
}
