//! Repository for the `avatar_media_assignments` table (PRD-146).

use sqlx::PgPool;
use x121_core::types::DbId;

use crate::models::avatar_media_assignment::{
    AvatarMediaAssignment, CreateAvatarMediaAssignment, UpdateAvatarMediaAssignment,
};

/// Column list for the `avatar_media_assignments` table.
const COLUMNS: &str = "id, avatar_id, media_slot_id, scene_type_id, image_variant_id, \
    file_path, media_type, is_passthrough, passthrough_track_id, notes, created_by, \
    created_at, updated_at";

/// Provides CRUD operations for avatar media assignments.
pub struct AvatarMediaAssignmentRepo;

impl AvatarMediaAssignmentRepo {
    /// Insert a new avatar media assignment, returning the created row.
    pub async fn create(
        pool: &PgPool,
        input: &CreateAvatarMediaAssignment,
    ) -> Result<AvatarMediaAssignment, sqlx::Error> {
        let query = format!(
            "INSERT INTO avatar_media_assignments
                (avatar_id, media_slot_id, scene_type_id, image_variant_id, file_path,
                 media_type, is_passthrough, passthrough_track_id, notes, created_by)
             VALUES ($1, $2, $3, $4, $5, COALESCE($6, 'image'),
                     COALESCE($7, false), $8, $9, $10)
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, AvatarMediaAssignment>(&query)
            .bind(input.avatar_id)
            .bind(input.media_slot_id)
            .bind(input.scene_type_id)
            .bind(input.image_variant_id)
            .bind(&input.file_path)
            .bind(&input.media_type)
            .bind(input.is_passthrough)
            .bind(input.passthrough_track_id)
            .bind(&input.notes)
            .bind(input.created_by)
            .fetch_one(pool)
            .await
    }

    /// Find an avatar media assignment by its internal ID.
    pub async fn find_by_id(
        pool: &PgPool,
        id: DbId,
    ) -> Result<Option<AvatarMediaAssignment>, sqlx::Error> {
        let query = format!("SELECT {COLUMNS} FROM avatar_media_assignments WHERE id = $1");
        sqlx::query_as::<_, AvatarMediaAssignment>(&query)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// List all media assignments for an avatar, ordered by creation time.
    pub async fn list_by_avatar(
        pool: &PgPool,
        avatar_id: DbId,
    ) -> Result<Vec<AvatarMediaAssignment>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM avatar_media_assignments \
             WHERE avatar_id = $1 ORDER BY created_at, id"
        );
        sqlx::query_as::<_, AvatarMediaAssignment>(&query)
            .bind(avatar_id)
            .fetch_all(pool)
            .await
    }

    /// Find an assignment for a specific avatar, media slot, and optional scene type.
    ///
    /// When `scene_type_id` is `None`, matches rows where `scene_type_id IS NULL`.
    pub async fn find_by_avatar_and_slot(
        pool: &PgPool,
        avatar_id: DbId,
        media_slot_id: DbId,
        scene_type_id: Option<DbId>,
    ) -> Result<Option<AvatarMediaAssignment>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM avatar_media_assignments \
             WHERE avatar_id = $1 AND media_slot_id = $2 \
             AND (scene_type_id = $3 OR ($3 IS NULL AND scene_type_id IS NULL))"
        );
        sqlx::query_as::<_, AvatarMediaAssignment>(&query)
            .bind(avatar_id)
            .bind(media_slot_id)
            .bind(scene_type_id)
            .fetch_optional(pool)
            .await
    }

    /// Update an avatar media assignment. Only non-`None` fields are applied.
    ///
    /// Returns `None` if no row with the given `id` exists.
    pub async fn update(
        pool: &PgPool,
        id: DbId,
        input: &UpdateAvatarMediaAssignment,
    ) -> Result<Option<AvatarMediaAssignment>, sqlx::Error> {
        let query = format!(
            "UPDATE avatar_media_assignments SET
                scene_type_id = COALESCE($2, scene_type_id),
                image_variant_id = COALESCE($3, image_variant_id),
                file_path = COALESCE($4, file_path),
                media_type = COALESCE($5, media_type),
                is_passthrough = COALESCE($6, is_passthrough),
                passthrough_track_id = COALESCE($7, passthrough_track_id),
                notes = COALESCE($8, notes)
             WHERE id = $1
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, AvatarMediaAssignment>(&query)
            .bind(id)
            .bind(input.scene_type_id)
            .bind(input.image_variant_id)
            .bind(&input.file_path)
            .bind(&input.media_type)
            .bind(input.is_passthrough)
            .bind(input.passthrough_track_id)
            .bind(&input.notes)
            .fetch_optional(pool)
            .await
    }

    /// Delete an avatar media assignment by ID. Returns `true` if a row was removed.
    pub async fn delete(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error> {
        let result = sqlx::query("DELETE FROM avatar_media_assignments WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected() > 0)
    }

    /// List all non-deleted assignments for an avatar, used during media resolution.
    ///
    /// Returns assignments ordered by media slot for deterministic resolution.
    pub async fn list_for_resolution(
        pool: &PgPool,
        avatar_id: DbId,
    ) -> Result<Vec<AvatarMediaAssignment>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM avatar_media_assignments \
             WHERE avatar_id = $1 ORDER BY media_slot_id, scene_type_id NULLS LAST, id"
        );
        sqlx::query_as::<_, AvatarMediaAssignment>(&query)
            .bind(avatar_id)
            .fetch_all(pool)
            .await
    }
}
