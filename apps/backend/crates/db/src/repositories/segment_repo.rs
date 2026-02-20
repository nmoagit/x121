//! Repository for the `segments` table.

use sqlx::PgPool;
use trulience_core::types::DbId;

use crate::models::segment::{CreateSegment, Segment, UpdateSegment};

/// Column list shared across queries to avoid repetition.
const COLUMNS: &str = "id, scene_id, sequence_index, status_id, seed_frame_path, \
    output_video_path, last_frame_path, quality_scores, created_at, updated_at";

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
                 output_video_path, last_frame_path, quality_scores)
             VALUES ($1, $2, COALESCE($3, 1), $4, $5, $6, $7)
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
            .fetch_one(pool)
            .await
    }

    /// Find a segment by its internal ID.
    pub async fn find_by_id(pool: &PgPool, id: DbId) -> Result<Option<Segment>, sqlx::Error> {
        let query = format!("SELECT {COLUMNS} FROM segments WHERE id = $1");
        sqlx::query_as::<_, Segment>(&query)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// List all segments for a given scene, ordered by sequence index ascending.
    pub async fn list_by_scene(pool: &PgPool, scene_id: DbId) -> Result<Vec<Segment>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM segments
             WHERE scene_id = $1
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
                quality_scores = COALESCE($7, quality_scores)
             WHERE id = $1
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
            .fetch_optional(pool)
            .await
    }

    /// Delete a segment by ID. Returns `true` if a row was removed.
    pub async fn delete(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error> {
        let result = sqlx::query("DELETE FROM segments WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected() > 0)
    }
}
