//! Repository for the `keyframes` table (PRD-62).

use sqlx::PgPool;
use x121_core::types::DbId;

use crate::models::keyframe::{CreateKeyframe, Keyframe};

/// Column list for keyframes queries.
const COLUMNS: &str = "id, segment_id, frame_number, timestamp_secs, \
    thumbnail_path, full_res_path, created_at, updated_at";

/// Provides CRUD operations for keyframes.
pub struct KeyframeRepo;

impl KeyframeRepo {
    /// Insert a new keyframe, returning the created row.
    pub async fn create(pool: &PgPool, input: &CreateKeyframe) -> Result<Keyframe, sqlx::Error> {
        let query = format!(
            "INSERT INTO keyframes
                (segment_id, frame_number, timestamp_secs,
                 thumbnail_path, full_res_path)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, Keyframe>(&query)
            .bind(input.segment_id)
            .bind(input.frame_number)
            .bind(input.timestamp_secs)
            .bind(&input.thumbnail_path)
            .bind(&input.full_res_path)
            .fetch_one(pool)
            .await
    }

    /// Find a keyframe by its primary key.
    pub async fn find_by_id(pool: &PgPool, id: DbId) -> Result<Option<Keyframe>, sqlx::Error> {
        let query = format!("SELECT {COLUMNS} FROM keyframes WHERE id = $1");
        sqlx::query_as::<_, Keyframe>(&query)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// List keyframes for a segment, ordered by frame number ascending.
    pub async fn list_for_segment(
        pool: &PgPool,
        segment_id: DbId,
    ) -> Result<Vec<Keyframe>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM keyframes
             WHERE segment_id = $1
             ORDER BY frame_number ASC"
        );
        sqlx::query_as::<_, Keyframe>(&query)
            .bind(segment_id)
            .fetch_all(pool)
            .await
    }

    /// List keyframes for an entire scene, joining through segments.
    ///
    /// Results are ordered by segment sequence position, then frame number.
    pub async fn list_for_scene(
        pool: &PgPool,
        scene_id: DbId,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<Keyframe>, sqlx::Error> {
        let query = format!(
            "SELECT k.id, k.segment_id, k.frame_number, k.timestamp_secs,
                    k.thumbnail_path, k.full_res_path, k.created_at, k.updated_at
             FROM keyframes k
             JOIN segments s ON s.id = k.segment_id
             WHERE s.scene_id = $1
             ORDER BY s.sequence ASC, k.frame_number ASC
             LIMIT $2 OFFSET $3"
        );
        sqlx::query_as::<_, Keyframe>(&query)
            .bind(scene_id)
            .bind(limit)
            .bind(offset)
            .fetch_all(pool)
            .await
    }

    /// Delete all keyframes for a segment (for re-extraction).
    ///
    /// Returns the number of deleted rows.
    pub async fn delete_for_segment(pool: &PgPool, segment_id: DbId) -> Result<u64, sqlx::Error> {
        let result = sqlx::query("DELETE FROM keyframes WHERE segment_id = $1")
            .bind(segment_id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected())
    }

    /// Count keyframes for a given segment.
    pub async fn count_for_segment(pool: &PgPool, segment_id: DbId) -> Result<i64, sqlx::Error> {
        let row: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM keyframes WHERE segment_id = $1")
            .bind(segment_id)
            .fetch_one(pool)
            .await?;
        Ok(row.0)
    }
}
