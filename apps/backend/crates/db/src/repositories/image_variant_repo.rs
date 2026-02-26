//! Repository for the `image_variants` table.

use sqlx::PgPool;
use x121_core::types::DbId;

use crate::models::image::{CreateImageVariant, ImageVariant, UpdateImageVariant};
use crate::models::status::StatusId;

/// Column list shared across queries to avoid repetition.
const COLUMNS: &str = "id, character_id, source_image_id, derived_image_id, variant_label, \
    status_id, file_path, variant_type, provenance, is_hero, file_size_bytes, width, height, \
    format, version, parent_variant_id, generation_params, deleted_at, created_at, updated_at";

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
                (character_id, source_image_id, derived_image_id, variant_label,
                 status_id, file_path, variant_type, provenance, is_hero,
                 file_size_bytes, width, height, format, version,
                 parent_variant_id, generation_params)
             VALUES ($1, $2, $3, $4, COALESCE($5, 1), $6, $7,
                     COALESCE($8, 'generated'), COALESCE($9, false),
                     $10, $11, $12, $13, COALESCE($14, 1), $15, $16)
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, ImageVariant>(&query)
            .bind(input.character_id)
            .bind(input.source_image_id)
            .bind(input.derived_image_id)
            .bind(&input.variant_label)
            .bind(input.status_id)
            .bind(&input.file_path)
            .bind(&input.variant_type)
            .bind(&input.provenance)
            .bind(input.is_hero)
            .bind(input.file_size_bytes)
            .bind(input.width)
            .bind(input.height)
            .bind(&input.format)
            .bind(input.version)
            .bind(input.parent_variant_id)
            .bind(&input.generation_params)
            .fetch_one(pool)
            .await
    }

    /// Find an image variant by its internal ID. Excludes soft-deleted rows.
    pub async fn find_by_id(pool: &PgPool, id: DbId) -> Result<Option<ImageVariant>, sqlx::Error> {
        let query =
            format!("SELECT {COLUMNS} FROM image_variants WHERE id = $1 AND deleted_at IS NULL");
        sqlx::query_as::<_, ImageVariant>(&query)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// List all image variants for a given character, ordered by most recently created first.
    /// Excludes soft-deleted rows.
    pub async fn list_by_character(
        pool: &PgPool,
        character_id: DbId,
    ) -> Result<Vec<ImageVariant>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM image_variants
             WHERE character_id = $1 AND deleted_at IS NULL
             ORDER BY created_at DESC"
        );
        sqlx::query_as::<_, ImageVariant>(&query)
            .bind(character_id)
            .fetch_all(pool)
            .await
    }

    /// List image variants for a character filtered by variant type.
    /// Excludes soft-deleted rows.
    pub async fn list_by_character_and_type(
        pool: &PgPool,
        character_id: DbId,
        variant_type: &str,
    ) -> Result<Vec<ImageVariant>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM image_variants
             WHERE character_id = $1 AND variant_type = $2 AND deleted_at IS NULL
             ORDER BY created_at DESC"
        );
        sqlx::query_as::<_, ImageVariant>(&query)
            .bind(character_id)
            .bind(variant_type)
            .fetch_all(pool)
            .await
    }

    /// Atomically clear the previous hero for a character+variant_type and set a new hero.
    ///
    /// Updates the target variant's status to `approved_status_id` and marks it as hero.
    /// Returns the updated variant.
    pub async fn set_hero(
        pool: &PgPool,
        variant_id: DbId,
        approved_status_id: StatusId,
    ) -> Result<Option<ImageVariant>, sqlx::Error> {
        // Use a CTE to atomically clear old hero and set new one.
        let query = format!(
            "WITH target AS (
                SELECT character_id, variant_type
                FROM image_variants
                WHERE id = $1 AND deleted_at IS NULL
            ),
            clear_old AS (
                UPDATE image_variants
                SET is_hero = false
                WHERE character_id = (SELECT character_id FROM target)
                  AND variant_type = (SELECT variant_type FROM target)
                  AND is_hero = true
                  AND id != $1
            )
            UPDATE image_variants
            SET is_hero = true, status_id = $2
            WHERE id = $1 AND deleted_at IS NULL
            RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, ImageVariant>(&query)
            .bind(variant_id)
            .bind(approved_status_id)
            .fetch_optional(pool)
            .await
    }

    /// Find the current hero variant for a character and variant type.
    pub async fn find_hero(
        pool: &PgPool,
        character_id: DbId,
        variant_type: &str,
    ) -> Result<Option<ImageVariant>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM image_variants
             WHERE character_id = $1 AND variant_type = $2
               AND is_hero = true AND deleted_at IS NULL"
        );
        sqlx::query_as::<_, ImageVariant>(&query)
            .bind(character_id)
            .bind(variant_type)
            .fetch_optional(pool)
            .await
    }

    /// Return the version chain for a variant by following `parent_variant_id`.
    ///
    /// Returns the full chain from the given variant back to the root,
    /// ordered by version descending (most recent first).
    pub async fn list_version_chain(
        pool: &PgPool,
        variant_id: DbId,
    ) -> Result<Vec<ImageVariant>, sqlx::Error> {
        let query = format!(
            "WITH RECURSIVE chain AS (
                SELECT {COLUMNS}
                FROM image_variants
                WHERE id = $1 AND deleted_at IS NULL
                UNION ALL
                SELECT iv.id, iv.character_id, iv.source_image_id, iv.derived_image_id,
                       iv.variant_label, iv.status_id, iv.file_path, iv.variant_type,
                       iv.provenance, iv.is_hero, iv.file_size_bytes, iv.width, iv.height,
                       iv.format, iv.version, iv.parent_variant_id, iv.generation_params,
                       iv.deleted_at, iv.created_at, iv.updated_at
                FROM image_variants iv
                INNER JOIN chain c ON iv.id = c.parent_variant_id
                WHERE iv.deleted_at IS NULL
            )
            SELECT * FROM chain ORDER BY version DESC"
        );
        sqlx::query_as::<_, ImageVariant>(&query)
            .bind(variant_id)
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
                source_image_id  = COALESCE($2, source_image_id),
                derived_image_id = COALESCE($3, derived_image_id),
                variant_label    = COALESCE($4, variant_label),
                status_id        = COALESCE($5, status_id),
                file_path        = COALESCE($6, file_path),
                variant_type     = COALESCE($7, variant_type),
                provenance       = COALESCE($8, provenance),
                is_hero          = COALESCE($9, is_hero),
                file_size_bytes  = COALESCE($10, file_size_bytes),
                width            = COALESCE($11, width),
                height           = COALESCE($12, height),
                format           = COALESCE($13, format),
                generation_params = COALESCE($14, generation_params)
             WHERE id = $1 AND deleted_at IS NULL
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, ImageVariant>(&query)
            .bind(id)
            .bind(input.source_image_id)
            .bind(input.derived_image_id)
            .bind(&input.variant_label)
            .bind(input.status_id)
            .bind(&input.file_path)
            .bind(&input.variant_type)
            .bind(&input.provenance)
            .bind(input.is_hero)
            .bind(input.file_size_bytes)
            .bind(input.width)
            .bind(input.height)
            .bind(&input.format)
            .bind(&input.generation_params)
            .fetch_optional(pool)
            .await
    }

    /// Soft-delete an image variant by ID. Returns `true` if a row was marked deleted.
    pub async fn soft_delete(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error> {
        let result = sqlx::query(
            "UPDATE image_variants SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL",
        )
        .bind(id)
        .execute(pool)
        .await?;
        Ok(result.rows_affected() > 0)
    }

    /// Restore a soft-deleted image variant. Returns `true` if a row was restored.
    pub async fn restore(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error> {
        let result = sqlx::query(
            "UPDATE image_variants SET deleted_at = NULL WHERE id = $1 AND deleted_at IS NOT NULL",
        )
        .bind(id)
        .execute(pool)
        .await?;
        Ok(result.rows_affected() > 0)
    }

    /// Permanently delete an image variant by ID. Returns `true` if a row was removed.
    pub async fn hard_delete(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error> {
        let result = sqlx::query("DELETE FROM image_variants WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected() > 0)
    }
}
