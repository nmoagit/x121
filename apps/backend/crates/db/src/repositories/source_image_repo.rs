//! Repository for the `source_images` table.

use sqlx::PgPool;
use trulience_core::types::DbId;

use crate::models::image::{CreateSourceImage, SourceImage, UpdateSourceImage};

/// Column list shared across queries to avoid repetition.
const COLUMNS: &str =
    "id, character_id, file_path, description, is_primary, created_at, updated_at";

/// Provides CRUD operations for source images.
pub struct SourceImageRepo;

impl SourceImageRepo {
    /// Insert a new source image, returning the created row.
    ///
    /// If `is_primary` is `None`, defaults to `false`.
    pub async fn create(
        pool: &PgPool,
        input: &CreateSourceImage,
    ) -> Result<SourceImage, sqlx::Error> {
        let query = format!(
            "INSERT INTO source_images (character_id, file_path, description, is_primary)
             VALUES ($1, $2, $3, COALESCE($4, false))
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, SourceImage>(&query)
            .bind(input.character_id)
            .bind(&input.file_path)
            .bind(&input.description)
            .bind(input.is_primary)
            .fetch_one(pool)
            .await
    }

    /// Find a source image by its internal ID.
    pub async fn find_by_id(pool: &PgPool, id: DbId) -> Result<Option<SourceImage>, sqlx::Error> {
        let query = format!("SELECT {COLUMNS} FROM source_images WHERE id = $1");
        sqlx::query_as::<_, SourceImage>(&query)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// List all source images for a given character, ordered by most recently created first.
    pub async fn list_by_character(
        pool: &PgPool,
        character_id: DbId,
    ) -> Result<Vec<SourceImage>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM source_images
             WHERE character_id = $1
             ORDER BY created_at DESC"
        );
        sqlx::query_as::<_, SourceImage>(&query)
            .bind(character_id)
            .fetch_all(pool)
            .await
    }

    /// Update a source image. Only non-`None` fields in `input` are applied.
    ///
    /// Returns `None` if no row with the given `id` exists.
    pub async fn update(
        pool: &PgPool,
        id: DbId,
        input: &UpdateSourceImage,
    ) -> Result<Option<SourceImage>, sqlx::Error> {
        let query = format!(
            "UPDATE source_images SET
                file_path = COALESCE($2, file_path),
                description = COALESCE($3, description),
                is_primary = COALESCE($4, is_primary)
             WHERE id = $1
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, SourceImage>(&query)
            .bind(id)
            .bind(&input.file_path)
            .bind(&input.description)
            .bind(input.is_primary)
            .fetch_optional(pool)
            .await
    }

    /// Delete a source image by ID. Returns `true` if a row was removed.
    pub async fn delete(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error> {
        let result = sqlx::query("DELETE FROM source_images WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected() > 0)
    }
}
