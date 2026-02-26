//! Repository for the `video_thumbnails` table.

use sqlx::PgPool;
use x121_core::types::DbId;

use crate::models::video::{CreateVideoThumbnail, VideoThumbnail};

const COLUMNS: &str =
    "id, source_type, source_id, frame_number, thumbnail_path, interval_seconds, width, height, created_at, updated_at";

pub struct VideoThumbnailRepo;

impl VideoThumbnailRepo {
    /// Insert a single thumbnail record.
    pub async fn create(
        pool: &PgPool,
        input: &CreateVideoThumbnail,
    ) -> Result<VideoThumbnail, sqlx::Error> {
        let query = format!(
            "INSERT INTO video_thumbnails (source_type, source_id, frame_number, thumbnail_path, interval_seconds, width, height)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, VideoThumbnail>(&query)
            .bind(&input.source_type)
            .bind(input.source_id)
            .bind(input.frame_number)
            .bind(&input.thumbnail_path)
            .bind(input.interval_seconds)
            .bind(input.width)
            .bind(input.height)
            .fetch_one(pool)
            .await
    }

    /// Insert multiple thumbnail records in a single statement.
    ///
    /// Uses a multi-row INSERT with `ON CONFLICT DO NOTHING` to skip duplicates.
    pub async fn create_batch(
        pool: &PgPool,
        thumbnails: &[CreateVideoThumbnail],
    ) -> Result<Vec<VideoThumbnail>, sqlx::Error> {
        if thumbnails.is_empty() {
            return Ok(Vec::new());
        }

        // Build a multi-row VALUES clause.
        let mut query = format!(
            "INSERT INTO video_thumbnails (source_type, source_id, frame_number, thumbnail_path, interval_seconds, width, height) VALUES "
        );
        let mut params_idx = 1u32;
        for (i, _) in thumbnails.iter().enumerate() {
            if i > 0 {
                query.push_str(", ");
            }
            query.push_str(&format!(
                "(${}, ${}, ${}, ${}, ${}, ${}, ${})",
                params_idx,
                params_idx + 1,
                params_idx + 2,
                params_idx + 3,
                params_idx + 4,
                params_idx + 5,
                params_idx + 6,
            ));
            params_idx += 7;
        }
        query.push_str(&format!(
            " ON CONFLICT (source_type, source_id, frame_number) DO NOTHING RETURNING {COLUMNS}"
        ));

        let mut q = sqlx::query_as::<_, VideoThumbnail>(&query);
        for t in thumbnails {
            q = q
                .bind(&t.source_type)
                .bind(t.source_id)
                .bind(t.frame_number)
                .bind(&t.thumbnail_path)
                .bind(t.interval_seconds)
                .bind(t.width)
                .bind(t.height);
        }

        q.fetch_all(pool).await
    }

    /// Find all thumbnails for a given source, ordered by frame number.
    pub async fn find_by_source(
        pool: &PgPool,
        source_type: &str,
        source_id: DbId,
    ) -> Result<Vec<VideoThumbnail>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM video_thumbnails
             WHERE source_type = $1 AND source_id = $2
             ORDER BY frame_number ASC"
        );
        sqlx::query_as::<_, VideoThumbnail>(&query)
            .bind(source_type)
            .bind(source_id)
            .fetch_all(pool)
            .await
    }

    /// Find a specific thumbnail by source and frame number.
    pub async fn find_by_source_and_frame(
        pool: &PgPool,
        source_type: &str,
        source_id: DbId,
        frame_number: i32,
    ) -> Result<Option<VideoThumbnail>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM video_thumbnails
             WHERE source_type = $1 AND source_id = $2 AND frame_number = $3"
        );
        sqlx::query_as::<_, VideoThumbnail>(&query)
            .bind(source_type)
            .bind(source_id)
            .bind(frame_number)
            .fetch_optional(pool)
            .await
    }

    /// Delete all thumbnails for a given source. Returns the number of rows deleted.
    pub async fn delete_by_source(
        pool: &PgPool,
        source_type: &str,
        source_id: DbId,
    ) -> Result<u64, sqlx::Error> {
        let result =
            sqlx::query("DELETE FROM video_thumbnails WHERE source_type = $1 AND source_id = $2")
                .bind(source_type)
                .bind(source_id)
                .execute(pool)
                .await?;
        Ok(result.rows_affected())
    }
}
