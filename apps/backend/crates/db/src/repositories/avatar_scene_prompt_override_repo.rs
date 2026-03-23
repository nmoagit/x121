//! Repository for the `avatar_scene_prompt_overrides` table (PRD-115).

use sqlx::PgPool;
use x121_core::types::DbId;

use crate::models::avatar_scene_prompt_override::{
    AvatarScenePromptOverride, CreateAvatarScenePromptOverride, UpdateAvatarScenePromptOverride,
};

/// Column list for the `avatar_scene_prompt_overrides` table.
const COLUMNS: &str = "id, avatar_id, scene_type_id, prompt_slot_id, fragments, \
    override_text, notes, created_by, created_at, updated_at";

/// Provides data access for avatar scene prompt overrides.
pub struct AvatarScenePromptOverrideRepo;

impl AvatarScenePromptOverrideRepo {
    /// Insert or update a avatar scene prompt override.
    ///
    /// Uses the unique constraint on `(avatar_id, scene_type_id, prompt_slot_id)`
    /// to upsert: if a row already exists the `fragments` and `notes` are updated.
    pub async fn upsert(
        pool: &PgPool,
        input: &CreateAvatarScenePromptOverride,
    ) -> Result<AvatarScenePromptOverride, sqlx::Error> {
        let query = format!(
            "INSERT INTO avatar_scene_prompt_overrides
                (avatar_id, scene_type_id, prompt_slot_id, fragments, override_text, notes, created_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             ON CONFLICT (avatar_id, scene_type_id, prompt_slot_id)
             DO UPDATE SET fragments = EXCLUDED.fragments,
                           override_text = EXCLUDED.override_text,
                           notes = EXCLUDED.notes
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, AvatarScenePromptOverride>(&query)
            .bind(input.avatar_id)
            .bind(input.scene_type_id)
            .bind(input.prompt_slot_id)
            .bind(&input.fragments)
            .bind(&input.override_text)
            .bind(&input.notes)
            .bind(input.created_by)
            .fetch_one(pool)
            .await
    }

    /// Find a specific override by the natural key triple.
    pub async fn find(
        pool: &PgPool,
        avatar_id: DbId,
        scene_type_id: DbId,
        prompt_slot_id: DbId,
    ) -> Result<Option<AvatarScenePromptOverride>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM avatar_scene_prompt_overrides \
             WHERE avatar_id = $1 AND scene_type_id = $2 AND prompt_slot_id = $3"
        );
        sqlx::query_as::<_, AvatarScenePromptOverride>(&query)
            .bind(avatar_id)
            .bind(scene_type_id)
            .bind(prompt_slot_id)
            .fetch_optional(pool)
            .await
    }

    /// List all overrides for a avatar, ordered by scene type and slot.
    pub async fn list_by_avatar(
        pool: &PgPool,
        avatar_id: DbId,
    ) -> Result<Vec<AvatarScenePromptOverride>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM avatar_scene_prompt_overrides \
             WHERE avatar_id = $1 ORDER BY scene_type_id, prompt_slot_id"
        );
        sqlx::query_as::<_, AvatarScenePromptOverride>(&query)
            .bind(avatar_id)
            .fetch_all(pool)
            .await
    }

    /// List all overrides for a avatar + scene type pair, ordered by slot.
    pub async fn list_by_avatar_and_scene_type(
        pool: &PgPool,
        avatar_id: DbId,
        scene_type_id: DbId,
    ) -> Result<Vec<AvatarScenePromptOverride>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM avatar_scene_prompt_overrides \
             WHERE avatar_id = $1 AND scene_type_id = $2 ORDER BY prompt_slot_id"
        );
        sqlx::query_as::<_, AvatarScenePromptOverride>(&query)
            .bind(avatar_id)
            .bind(scene_type_id)
            .fetch_all(pool)
            .await
    }

    /// List all overrides for a scene type, ordered by avatar and slot.
    pub async fn list_by_scene_type(
        pool: &PgPool,
        scene_type_id: DbId,
    ) -> Result<Vec<AvatarScenePromptOverride>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM avatar_scene_prompt_overrides \
             WHERE scene_type_id = $1 ORDER BY avatar_id, prompt_slot_id"
        );
        sqlx::query_as::<_, AvatarScenePromptOverride>(&query)
            .bind(scene_type_id)
            .fetch_all(pool)
            .await
    }

    /// Update an override by ID. Only non-`None` fields are applied.
    ///
    /// Returns `None` if no row with the given `id` exists.
    pub async fn update(
        pool: &PgPool,
        id: DbId,
        input: &UpdateAvatarScenePromptOverride,
    ) -> Result<Option<AvatarScenePromptOverride>, sqlx::Error> {
        let query = format!(
            "UPDATE avatar_scene_prompt_overrides SET
                fragments = COALESCE($2, fragments),
                override_text = COALESCE($3, override_text),
                notes = COALESCE($4, notes)
             WHERE id = $1
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, AvatarScenePromptOverride>(&query)
            .bind(id)
            .bind(&input.fragments)
            .bind(&input.override_text)
            .bind(&input.notes)
            .fetch_optional(pool)
            .await
    }

    /// Delete an override by ID. Returns `true` if a row was removed.
    pub async fn delete(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error> {
        let result = sqlx::query("DELETE FROM avatar_scene_prompt_overrides WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected() > 0)
    }
}
