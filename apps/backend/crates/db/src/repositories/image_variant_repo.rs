//! Repository for the `image_variants` table.

use sqlx::PgPool;
use trulience_core::types::DbId;

use crate::models::image::{CreateImageVariant, ImageVariant, UpdateImageVariant};

/// Column list shared across queries to avoid repetition.
const COLUMNS: &str = "id, character_id, source_image_id, derived_image_id, variant_label, status_id, file_path, created_at, updated_at";

/// Provides CRUD operations for image variants.
pub struct ImageVariantRepo;

impl ImageVariantRepo {
    /// Insert a new image variant, returning the created row.
    ///
    /// If `status_id` is `None`, defaults to 1 (Pending).
    pub async fn create(
        pool: &PgPool,
        input: &CreateImageVariant,
    ) -> Result<ImageVariant, sqlx::Error> {
        let query = format!(
            "INSERT INTO image_variants
                (character_id, source_image_id, derived_image_id, variant_label, status_id, file_path)
             VALUES ($1, $2, $3, $4, COALESCE($5, 1), $6)
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, ImageVariant>(&query)
            .bind(input.character_id)
            .bind(input.source_image_id)
            .bind(input.derived_image_id)
            .bind(&input.variant_label)
            .bind(input.status_id)
            .bind(&input.file_path)
            .fetch_one(pool)
            .await
    }

    /// Find an image variant by its internal ID.
    pub async fn find_by_id(pool: &PgPool, id: DbId) -> Result<Option<ImageVariant>, sqlx::Error> {
        let query = format!("SELECT {COLUMNS} FROM image_variants WHERE id = $1");
        sqlx::query_as::<_, ImageVariant>(&query)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// List all image variants for a given character, ordered by most recently created first.
    pub async fn list_by_character(
        pool: &PgPool,
        character_id: DbId,
    ) -> Result<Vec<ImageVariant>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM image_variants
             WHERE character_id = $1
             ORDER BY created_at DESC"
        );
        sqlx::query_as::<_, ImageVariant>(&query)
            .bind(character_id)
            .fetch_all(pool)
            .await
    }

    /// Update an image variant. Only non-`None` fields in `input` are applied.
    ///
    /// Returns `None` if no row with the given `id` exists.
    pub async fn update(
        pool: &PgPool,
        id: DbId,
        input: &UpdateImageVariant,
    ) -> Result<Option<ImageVariant>, sqlx::Error> {
        let query = format!(
            "UPDATE image_variants SET
                source_image_id = COALESCE($2, source_image_id),
                derived_image_id = COALESCE($3, derived_image_id),
                variant_label = COALESCE($4, variant_label),
                status_id = COALESCE($5, status_id),
                file_path = COALESCE($6, file_path)
             WHERE id = $1
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, ImageVariant>(&query)
            .bind(id)
            .bind(input.source_image_id)
            .bind(input.derived_image_id)
            .bind(&input.variant_label)
            .bind(input.status_id)
            .bind(&input.file_path)
            .fetch_optional(pool)
            .await
    }

    /// Delete an image variant by ID. Returns `true` if a row was removed.
    pub async fn delete(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error> {
        let result = sqlx::query("DELETE FROM image_variants WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected() > 0)
    }
}
