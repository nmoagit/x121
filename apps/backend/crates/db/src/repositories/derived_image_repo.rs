//! Repository for the `derived_images` table.

use sqlx::PgPool;
use trulience_core::types::DbId;

use crate::models::image::{CreateDerivedImage, DerivedImage, UpdateDerivedImage};

/// Column list shared across queries to avoid repetition.
const COLUMNS: &str = "id, source_image_id, character_id, file_path, variant_type, \
    description, deleted_at, created_at, updated_at";

/// Provides CRUD operations for derived images.
pub struct DerivedImageRepo;

impl DerivedImageRepo {
    /// Insert a new derived image, returning the created row.
    pub async fn create(
        pool: &PgPool,
        input: &CreateDerivedImage,
    ) -> Result<DerivedImage, sqlx::Error> {
        let query = format!(
            "INSERT INTO derived_images (source_image_id, character_id, file_path, variant_type, description)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, DerivedImage>(&query)
            .bind(input.source_image_id)
            .bind(input.character_id)
            .bind(&input.file_path)
            .bind(&input.variant_type)
            .bind(&input.description)
            .fetch_one(pool)
            .await
    }

    /// Find a derived image by its internal ID. Excludes soft-deleted rows.
    pub async fn find_by_id(pool: &PgPool, id: DbId) -> Result<Option<DerivedImage>, sqlx::Error> {
        let query =
            format!("SELECT {COLUMNS} FROM derived_images WHERE id = $1 AND deleted_at IS NULL");
        sqlx::query_as::<_, DerivedImage>(&query)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// List all derived images for a given source image, ordered by most recently created first.
    /// Excludes soft-deleted rows.
    pub async fn list_by_source_image(
        pool: &PgPool,
        source_image_id: DbId,
    ) -> Result<Vec<DerivedImage>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM derived_images
             WHERE source_image_id = $1 AND deleted_at IS NULL
             ORDER BY created_at DESC"
        );
        sqlx::query_as::<_, DerivedImage>(&query)
            .bind(source_image_id)
            .fetch_all(pool)
            .await
    }

    /// List all derived images for a given character, ordered by most recently created first.
    /// Excludes soft-deleted rows.
    pub async fn list_by_character(
        pool: &PgPool,
        character_id: DbId,
    ) -> Result<Vec<DerivedImage>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM derived_images
             WHERE character_id = $1 AND deleted_at IS NULL
             ORDER BY created_at DESC"
        );
        sqlx::query_as::<_, DerivedImage>(&query)
            .bind(character_id)
            .fetch_all(pool)
            .await
    }

    /// Update a derived image. Only non-`None` fields in `input` are applied.
    ///
    /// Returns `None` if no row with the given `id` exists.
    pub async fn update(
        pool: &PgPool,
        id: DbId,
        input: &UpdateDerivedImage,
    ) -> Result<Option<DerivedImage>, sqlx::Error> {
        let query = format!(
            "UPDATE derived_images SET
                file_path = COALESCE($2, file_path),
                variant_type = COALESCE($3, variant_type),
                description = COALESCE($4, description)
             WHERE id = $1 AND deleted_at IS NULL
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, DerivedImage>(&query)
            .bind(id)
            .bind(&input.file_path)
            .bind(&input.variant_type)
            .bind(&input.description)
            .fetch_optional(pool)
            .await
    }

    /// Find a derived image by ID, including soft-deleted rows. Used for parent-check on restore.
    pub async fn find_by_id_include_deleted(
        pool: &PgPool,
        id: DbId,
    ) -> Result<Option<DerivedImage>, sqlx::Error> {
        let query = format!("SELECT {COLUMNS} FROM derived_images WHERE id = $1");
        sqlx::query_as::<_, DerivedImage>(&query)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// Soft-delete a derived image by ID. Returns `true` if a row was marked deleted.
    pub async fn soft_delete(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error> {
        let result = sqlx::query(
            "UPDATE derived_images SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL",
        )
        .bind(id)
        .execute(pool)
        .await?;
        Ok(result.rows_affected() > 0)
    }

    /// Restore a soft-deleted derived image. Returns `true` if a row was restored.
    pub async fn restore(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error> {
        let result = sqlx::query(
            "UPDATE derived_images SET deleted_at = NULL WHERE id = $1 AND deleted_at IS NOT NULL",
        )
        .bind(id)
        .execute(pool)
        .await?;
        Ok(result.rows_affected() > 0)
    }

    /// Permanently delete a derived image by ID. Returns `true` if a row was removed.
    pub async fn hard_delete(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error> {
        let result = sqlx::query("DELETE FROM derived_images WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected() > 0)
    }
}
