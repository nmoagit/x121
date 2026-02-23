//! Repository for the `segments` table.

use sqlx::PgPool;
use trulience_core::types::DbId;

use crate::models::generation::UpdateSegmentGeneration;
use crate::models::segment::{CreateSegment, Segment, UpdateSegment};

/// Column list shared across queries to avoid repetition.
const COLUMNS: &str = "id, scene_id, sequence_index, status_id, seed_frame_path, \
    output_video_path, last_frame_path, quality_scores, \
    duration_secs, cumulative_duration_secs, boundary_frame_index, \
    boundary_selection_mode, generation_started_at, generation_completed_at, \
    worker_id, prompt_type, prompt_text, \
    previous_segment_id, regeneration_count, is_stale, \
    boundary_ssim_before, boundary_ssim_after, \
    deleted_at, created_at, updated_at";

/// Provides CRUD operations for segments.
pub struct SegmentRepo;

impl SegmentRepo {
    /// Insert a new segment, returning the created row.
    ///
    /// If `status_id` is `None`, defaults to 1 (Pending).
    pub async fn create(pool: &PgPool, input: &CreateSegment) -> Result<Segment, sqlx::Error> {
        let query = format!(
            "INSERT INTO segments
                (scene_id, sequence_index, status_id, seed_frame_path,
                 output_video_path, last_frame_path, quality_scores,
                 duration_secs, cumulative_duration_secs, boundary_frame_index,
                 boundary_selection_mode, generation_started_at, generation_completed_at,
                 worker_id, prompt_type, prompt_text)
             VALUES ($1, $2, COALESCE($3, 1), $4, $5, $6, $7,
                     $8, $9, $10, $11, $12, $13, $14, $15, $16)
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, Segment>(&query)
            .bind(input.scene_id)
            .bind(input.sequence_index)
            .bind(input.status_id)
            .bind(&input.seed_frame_path)
            .bind(&input.output_video_path)
            .bind(&input.last_frame_path)
            .bind(&input.quality_scores)
            .bind(input.duration_secs)
            .bind(input.cumulative_duration_secs)
            .bind(input.boundary_frame_index)
            .bind(&input.boundary_selection_mode)
            .bind(input.generation_started_at)
            .bind(input.generation_completed_at)
            .bind(input.worker_id)
            .bind(&input.prompt_type)
            .bind(&input.prompt_text)
            .fetch_one(pool)
            .await
    }

    /// Find a segment by its internal ID. Excludes soft-deleted rows.
    pub async fn find_by_id(pool: &PgPool, id: DbId) -> Result<Option<Segment>, sqlx::Error> {
        let query = format!("SELECT {COLUMNS} FROM segments WHERE id = $1 AND deleted_at IS NULL");
        sqlx::query_as::<_, Segment>(&query)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// List all segments for a given scene, ordered by sequence index ascending.
    /// Excludes soft-deleted rows.
    pub async fn list_by_scene(pool: &PgPool, scene_id: DbId) -> Result<Vec<Segment>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM segments
             WHERE scene_id = $1 AND deleted_at IS NULL
             ORDER BY sequence_index ASC"
        );
        sqlx::query_as::<_, Segment>(&query)
            .bind(scene_id)
            .fetch_all(pool)
            .await
    }

    /// Update a segment. Only non-`None` fields in `input` are applied.
    ///
    /// Returns `None` if no row with the given `id` exists.
    pub async fn update(
        pool: &PgPool,
        id: DbId,
        input: &UpdateSegment,
    ) -> Result<Option<Segment>, sqlx::Error> {
        let query = format!(
            "UPDATE segments SET
                sequence_index = COALESCE($2, sequence_index),
                status_id = COALESCE($3, status_id),
                seed_frame_path = COALESCE($4, seed_frame_path),
                output_video_path = COALESCE($5, output_video_path),
                last_frame_path = COALESCE($6, last_frame_path),
                quality_scores = COALESCE($7, quality_scores),
                duration_secs = COALESCE($8, duration_secs),
                cumulative_duration_secs = COALESCE($9, cumulative_duration_secs),
                boundary_frame_index = COALESCE($10, boundary_frame_index),
                boundary_selection_mode = COALESCE($11, boundary_selection_mode),
                generation_started_at = COALESCE($12, generation_started_at),
                generation_completed_at = COALESCE($13, generation_completed_at),
                worker_id = COALESCE($14, worker_id),
                prompt_type = COALESCE($15, prompt_type),
                prompt_text = COALESCE($16, prompt_text)
             WHERE id = $1 AND deleted_at IS NULL
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, Segment>(&query)
            .bind(id)
            .bind(input.sequence_index)
            .bind(input.status_id)
            .bind(&input.seed_frame_path)
            .bind(&input.output_video_path)
            .bind(&input.last_frame_path)
            .bind(&input.quality_scores)
            .bind(input.duration_secs)
            .bind(input.cumulative_duration_secs)
            .bind(input.boundary_frame_index)
            .bind(&input.boundary_selection_mode)
            .bind(input.generation_started_at)
            .bind(input.generation_completed_at)
            .bind(input.worker_id)
            .bind(&input.prompt_type)
            .bind(&input.prompt_text)
            .fetch_optional(pool)
            .await
    }

    /// Soft-delete a segment by ID. Returns `true` if a row was marked deleted.
    pub async fn soft_delete(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error> {
        let result = sqlx::query(
            "UPDATE segments SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL",
        )
        .bind(id)
        .execute(pool)
        .await?;
        Ok(result.rows_affected() > 0)
    }

    /// Restore a soft-deleted segment. Returns `true` if a row was restored.
    pub async fn restore(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error> {
        let result = sqlx::query(
            "UPDATE segments SET deleted_at = NULL WHERE id = $1 AND deleted_at IS NOT NULL",
        )
        .bind(id)
        .execute(pool)
        .await?;
        Ok(result.rows_affected() > 0)
    }

    /// Permanently delete a segment by ID. Returns `true` if a row was removed.
    pub async fn hard_delete(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error> {
        let result = sqlx::query("DELETE FROM segments WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected() > 0)
    }

    // -- Generation-specific methods (PRD-24) ---------------------------------

    /// Update only generation-specific fields on a segment.
    pub async fn update_generation_state(
        pool: &PgPool,
        id: DbId,
        input: &UpdateSegmentGeneration,
    ) -> Result<Option<Segment>, sqlx::Error> {
        let query = format!(
            "UPDATE segments SET
                duration_secs = COALESCE($2, duration_secs),
                cumulative_duration_secs = COALESCE($3, cumulative_duration_secs),
                boundary_frame_index = COALESCE($4, boundary_frame_index),
                boundary_selection_mode = COALESCE($5, boundary_selection_mode),
                generation_started_at = COALESCE($6, generation_started_at),
                generation_completed_at = COALESCE($7, generation_completed_at),
                worker_id = COALESCE($8, worker_id),
                prompt_type = COALESCE($9, prompt_type),
                prompt_text = COALESCE($10, prompt_text),
                seed_frame_path = COALESCE($11, seed_frame_path),
                last_frame_path = COALESCE($12, last_frame_path),
                output_video_path = COALESCE($13, output_video_path)
             WHERE id = $1 AND deleted_at IS NULL
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, Segment>(&query)
            .bind(id)
            .bind(input.duration_secs)
            .bind(input.cumulative_duration_secs)
            .bind(input.boundary_frame_index)
            .bind(&input.boundary_selection_mode)
            .bind(input.generation_started_at)
            .bind(input.generation_completed_at)
            .bind(input.worker_id)
            .bind(&input.prompt_type)
            .bind(&input.prompt_text)
            .bind(&input.seed_frame_path)
            .bind(&input.last_frame_path)
            .bind(&input.output_video_path)
            .fetch_optional(pool)
            .await
    }

    /// Get the last completed segment for a scene (for generation resumption).
    ///
    /// A "completed" segment is one with a non-NULL `generation_completed_at`.
    pub async fn get_last_completed(
        pool: &PgPool,
        scene_id: DbId,
    ) -> Result<Option<Segment>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM segments
             WHERE scene_id = $1
               AND deleted_at IS NULL
               AND generation_completed_at IS NOT NULL
             ORDER BY sequence_index DESC
             LIMIT 1"
        );
        sqlx::query_as::<_, Segment>(&query)
            .bind(scene_id)
            .fetch_optional(pool)
            .await
    }
}
