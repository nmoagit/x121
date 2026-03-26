//! Repository for the `avatar_images` table (PRD-154).
//!
//! Provides CRUD + approve/reject for per-avatar image instances.

use sqlx::PgPool;
use x121_core::types::DbId;

use crate::models::avatar_image::{
    self, AvatarImage, AvatarImageDetail, CreateAvatarImage, UpdateAvatarImage,
};

/// Column list shared across queries to avoid repetition.
const COLUMNS: &str = "id, avatar_id, image_type_id, track_id, media_variant_id, \
    status_id, generation_started_at, generation_completed_at, \
    deleted_at, created_at, updated_at";

/// Provides CRUD operations for avatar images.
pub struct AvatarImageRepo;

impl AvatarImageRepo {
    /// Insert a new avatar image, returning the created row.
    ///
    /// If `status_id` is `None`, defaults to 1 (Pending).
    pub async fn create(
        pool: &PgPool,
        input: &CreateAvatarImage,
    ) -> Result<AvatarImage, sqlx::Error> {
        let query = format!(
            "INSERT INTO avatar_images
                (avatar_id, image_type_id, track_id, media_variant_id, status_id)
             VALUES ($1, $2, $3, $4, COALESCE($5, 1))
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, AvatarImage>(&query)
            .bind(input.avatar_id)
            .bind(input.image_type_id)
            .bind(input.track_id)
            .bind(input.media_variant_id)
            .bind(input.status_id)
            .fetch_one(pool)
            .await
    }

    /// Find an avatar image by its internal ID. Excludes soft-deleted rows.
    pub async fn find_by_id(pool: &PgPool, id: DbId) -> Result<Option<AvatarImage>, sqlx::Error> {
        let query =
            format!("SELECT {COLUMNS} FROM avatar_images WHERE id = $1 AND deleted_at IS NULL");
        sqlx::query_as::<_, AvatarImage>(&query)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// List all images for a given avatar, ordered by creation time ascending.
    /// Excludes soft-deleted rows.
    pub async fn list_by_avatar(
        pool: &PgPool,
        avatar_id: DbId,
    ) -> Result<Vec<AvatarImage>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM avatar_images
             WHERE avatar_id = $1 AND deleted_at IS NULL
             ORDER BY created_at ASC"
        );
        sqlx::query_as::<_, AvatarImage>(&query)
            .bind(avatar_id)
            .fetch_all(pool)
            .await
    }

    /// List images for an avatar with enriched details (image type name, track name, file path).
    pub async fn list_by_avatar_detailed(
        pool: &PgPool,
        avatar_id: DbId,
    ) -> Result<Vec<AvatarImageDetail>, sqlx::Error> {
        let cols = COLUMNS
            .split(", ")
            .map(|c| format!("ai.{}", c.trim()))
            .collect::<Vec<_>>()
            .join(", ");
        let query = format!(
            "SELECT {cols}, \
                    it.name AS image_type_name, \
                    t.name AS track_name, \
                    mv.file_path AS variant_file_path \
             FROM avatar_images ai \
             JOIN image_types it ON it.id = ai.image_type_id \
             LEFT JOIN tracks t ON t.id = ai.track_id \
             LEFT JOIN media_variants mv ON mv.id = ai.media_variant_id \
             WHERE ai.avatar_id = $1 AND ai.deleted_at IS NULL \
             ORDER BY ai.created_at ASC"
        );
        sqlx::query_as::<_, AvatarImageDetail>(&query)
            .bind(avatar_id)
            .fetch_all(pool)
            .await
    }

    /// Update an avatar image. Only non-`None` fields in `input` are applied.
    ///
    /// Returns `None` if no row with the given `id` exists.
    pub async fn update(
        pool: &PgPool,
        id: DbId,
        input: &UpdateAvatarImage,
    ) -> Result<Option<AvatarImage>, sqlx::Error> {
        let query = format!(
            "UPDATE avatar_images SET
                status_id = COALESCE($2, status_id),
                media_variant_id = COALESCE($3, media_variant_id),
                generation_started_at = COALESCE($4, generation_started_at),
                generation_completed_at = COALESCE($5, generation_completed_at)
             WHERE id = $1 AND deleted_at IS NULL
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, AvatarImage>(&query)
            .bind(id)
            .bind(input.status_id)
            .bind(input.media_variant_id)
            .bind(input.generation_started_at)
            .bind(input.generation_completed_at)
            .fetch_optional(pool)
            .await
    }

    /// Soft-delete an avatar image by ID. Returns `true` if a row was marked deleted.
    pub async fn soft_delete(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error> {
        let result = sqlx::query(
            "UPDATE avatar_images SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL",
        )
        .bind(id)
        .execute(pool)
        .await?;
        Ok(result.rows_affected() > 0)
    }

    /// Approve an avatar image (set status_id to APPROVED).
    ///
    /// Returns `None` if no row with the given `id` exists.
    pub async fn approve(pool: &PgPool, id: DbId) -> Result<Option<AvatarImage>, sqlx::Error> {
        let query = format!(
            "UPDATE avatar_images SET status_id = $2 \
             WHERE id = $1 AND deleted_at IS NULL \
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, AvatarImage>(&query)
            .bind(id)
            .bind(avatar_image::status::APPROVED)
            .fetch_optional(pool)
            .await
    }

    /// Reject an avatar image (set status_id to REJECTED).
    ///
    /// Returns `None` if no row with the given `id` exists.
    pub async fn reject(pool: &PgPool, id: DbId) -> Result<Option<AvatarImage>, sqlx::Error> {
        let query = format!(
            "UPDATE avatar_images SET status_id = $2 \
             WHERE id = $1 AND deleted_at IS NULL \
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, AvatarImage>(&query)
            .bind(id)
            .bind(avatar_image::status::REJECTED)
            .fetch_optional(pool)
            .await
    }
}
