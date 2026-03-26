//! Repository for the `image_type_track_configs` table (PRD-154).
//!
//! Provides CRUD + upsert for per-(image_type, track) workflow and prompt
//! override configuration.

use sqlx::PgPool;
use x121_core::types::DbId;

use crate::models::image_type_track_config::{
    CreateImageTypeTrackConfig, ImageTypeTrackConfig, ImageTypeTrackConfigWithTrack,
};

/// Column list for single-table queries.
const COLUMNS: &str = "id, image_type_id, track_id, workflow_id, \
    prompt_template, negative_prompt_template, \
    created_at, updated_at";

/// Column list for queries that JOIN with `tracks`.
const COLUMNS_WITH_TRACK: &str = "c.id, c.image_type_id, c.track_id, c.workflow_id, \
    c.prompt_template, c.negative_prompt_template, \
    c.created_at, c.updated_at, \
    t.name AS track_name, t.slug AS track_slug";

/// Provides CRUD operations for image type track configs.
pub struct ImageTypeTrackConfigRepo;

impl ImageTypeTrackConfigRepo {
    /// Find a config by the unique (image_type_id, track_id) pair.
    pub async fn find_by_image_type_and_track(
        pool: &PgPool,
        image_type_id: DbId,
        track_id: DbId,
    ) -> Result<Option<ImageTypeTrackConfig>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM image_type_track_configs \
             WHERE image_type_id = $1 AND track_id = $2"
        );
        sqlx::query_as::<_, ImageTypeTrackConfig>(&query)
            .bind(image_type_id)
            .bind(track_id)
            .fetch_optional(pool)
            .await
    }

    /// List all configs for an image type, enriched with track name and slug.
    ///
    /// Ordered by track sort_order then track name.
    pub async fn list_by_image_type(
        pool: &PgPool,
        image_type_id: DbId,
    ) -> Result<Vec<ImageTypeTrackConfigWithTrack>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS_WITH_TRACK} \
             FROM image_type_track_configs c \
             JOIN tracks t ON t.id = c.track_id \
             WHERE c.image_type_id = $1 \
             ORDER BY t.sort_order, t.name"
        );
        sqlx::query_as::<_, ImageTypeTrackConfigWithTrack>(&query)
            .bind(image_type_id)
            .fetch_all(pool)
            .await
    }

    /// Insert or update a config for the given (image_type_id, track_id) pair.
    ///
    /// On conflict, updates all mutable columns. Returns the resulting row.
    pub async fn upsert(
        pool: &PgPool,
        input: &CreateImageTypeTrackConfig,
    ) -> Result<ImageTypeTrackConfig, sqlx::Error> {
        let query = format!(
            "INSERT INTO image_type_track_configs
                (image_type_id, track_id, workflow_id,
                 prompt_template, negative_prompt_template)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (image_type_id, track_id) DO UPDATE SET
                workflow_id = EXCLUDED.workflow_id,
                prompt_template = EXCLUDED.prompt_template,
                negative_prompt_template = EXCLUDED.negative_prompt_template,
                updated_at = now()
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, ImageTypeTrackConfig>(&query)
            .bind(input.image_type_id)
            .bind(input.track_id)
            .bind(input.workflow_id)
            .bind(&input.prompt_template)
            .bind(&input.negative_prompt_template)
            .fetch_one(pool)
            .await
    }

    /// Delete a config by ID. Returns `true` if a row was removed.
    pub async fn delete(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error> {
        let result = sqlx::query("DELETE FROM image_type_track_configs WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected() > 0)
    }

    /// Delete a config by its unique (image_type_id, track_id) pair.
    ///
    /// Returns `true` if a row was removed.
    pub async fn delete_by_image_type_and_track(
        pool: &PgPool,
        image_type_id: DbId,
        track_id: DbId,
    ) -> Result<bool, sqlx::Error> {
        let result = sqlx::query(
            "DELETE FROM image_type_track_configs \
             WHERE image_type_id = $1 AND track_id = $2",
        )
        .bind(image_type_id)
        .bind(track_id)
        .execute(pool)
        .await?;
        Ok(result.rows_affected() > 0)
    }
}
