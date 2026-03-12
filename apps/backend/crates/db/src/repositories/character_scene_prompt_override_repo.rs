//! Repository for the `character_scene_prompt_overrides` table (PRD-115).

use sqlx::PgPool;
use x121_core::types::DbId;

use crate::models::character_scene_prompt_override::{
    CharacterScenePromptOverride, CreateCharacterScenePromptOverride,
    UpdateCharacterScenePromptOverride,
};

/// Column list for the `character_scene_prompt_overrides` table.
const COLUMNS: &str = "id, character_id, scene_type_id, prompt_slot_id, fragments, \
    override_text, notes, created_by, created_at, updated_at";

/// Provides data access for character scene prompt overrides.
pub struct CharacterScenePromptOverrideRepo;

impl CharacterScenePromptOverrideRepo {
    /// Insert or update a character scene prompt override.
    ///
    /// Uses the unique constraint on `(character_id, scene_type_id, prompt_slot_id)`
    /// to upsert: if a row already exists the `fragments` and `notes` are updated.
    pub async fn upsert(
        pool: &PgPool,
        input: &CreateCharacterScenePromptOverride,
    ) -> Result<CharacterScenePromptOverride, sqlx::Error> {
        let query = format!(
            "INSERT INTO character_scene_prompt_overrides
                (character_id, scene_type_id, prompt_slot_id, fragments, override_text, notes, created_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             ON CONFLICT (character_id, scene_type_id, prompt_slot_id)
             DO UPDATE SET fragments = EXCLUDED.fragments,
                           override_text = EXCLUDED.override_text,
                           notes = EXCLUDED.notes
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, CharacterScenePromptOverride>(&query)
            .bind(input.character_id)
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
        character_id: DbId,
        scene_type_id: DbId,
        prompt_slot_id: DbId,
    ) -> Result<Option<CharacterScenePromptOverride>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM character_scene_prompt_overrides \
             WHERE character_id = $1 AND scene_type_id = $2 AND prompt_slot_id = $3"
        );
        sqlx::query_as::<_, CharacterScenePromptOverride>(&query)
            .bind(character_id)
            .bind(scene_type_id)
            .bind(prompt_slot_id)
            .fetch_optional(pool)
            .await
    }

    /// List all overrides for a character, ordered by scene type and slot.
    pub async fn list_by_character(
        pool: &PgPool,
        character_id: DbId,
    ) -> Result<Vec<CharacterScenePromptOverride>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM character_scene_prompt_overrides \
             WHERE character_id = $1 ORDER BY scene_type_id, prompt_slot_id"
        );
        sqlx::query_as::<_, CharacterScenePromptOverride>(&query)
            .bind(character_id)
            .fetch_all(pool)
            .await
    }

    /// List all overrides for a character + scene type pair, ordered by slot.
    pub async fn list_by_character_and_scene_type(
        pool: &PgPool,
        character_id: DbId,
        scene_type_id: DbId,
    ) -> Result<Vec<CharacterScenePromptOverride>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM character_scene_prompt_overrides \
             WHERE character_id = $1 AND scene_type_id = $2 ORDER BY prompt_slot_id"
        );
        sqlx::query_as::<_, CharacterScenePromptOverride>(&query)
            .bind(character_id)
            .bind(scene_type_id)
            .fetch_all(pool)
            .await
    }

    /// List all overrides for a scene type, ordered by character and slot.
    pub async fn list_by_scene_type(
        pool: &PgPool,
        scene_type_id: DbId,
    ) -> Result<Vec<CharacterScenePromptOverride>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM character_scene_prompt_overrides \
             WHERE scene_type_id = $1 ORDER BY character_id, prompt_slot_id"
        );
        sqlx::query_as::<_, CharacterScenePromptOverride>(&query)
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
        input: &UpdateCharacterScenePromptOverride,
    ) -> Result<Option<CharacterScenePromptOverride>, sqlx::Error> {
        let query = format!(
            "UPDATE character_scene_prompt_overrides SET
                fragments = COALESCE($2, fragments),
                override_text = COALESCE($3, override_text),
                notes = COALESCE($4, notes)
             WHERE id = $1
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, CharacterScenePromptOverride>(&query)
            .bind(id)
            .bind(&input.fragments)
            .bind(&input.override_text)
            .bind(&input.notes)
            .fetch_optional(pool)
            .await
    }

    /// Delete an override by ID. Returns `true` if a row was removed.
    pub async fn delete(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error> {
        let result = sqlx::query("DELETE FROM character_scene_prompt_overrides WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected() > 0)
    }
}
