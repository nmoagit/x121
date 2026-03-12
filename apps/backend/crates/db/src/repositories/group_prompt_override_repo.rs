//! Repository for the `group_prompt_overrides` table.

use sqlx::PgPool;
use x121_core::types::DbId;

use crate::models::group_prompt_override::{CreateGroupPromptOverride, GroupPromptOverride};

/// Column list for the `group_prompt_overrides` table.
const COLUMNS: &str = "id, group_id, scene_type_id, prompt_slot_id, fragments, \
    override_text, notes, created_by, created_at, updated_at";

/// Provides data access for group-level prompt overrides.
pub struct GroupPromptOverrideRepo;

impl GroupPromptOverrideRepo {
    /// Insert or update a group prompt override.
    ///
    /// Uses the unique constraint on `(group_id, scene_type_id, prompt_slot_id)`
    /// to upsert: if a row already exists the `fragments` and `notes` are updated.
    pub async fn upsert(
        pool: &PgPool,
        input: &CreateGroupPromptOverride,
    ) -> Result<GroupPromptOverride, sqlx::Error> {
        let query = format!(
            "INSERT INTO group_prompt_overrides
                (group_id, scene_type_id, prompt_slot_id, fragments, override_text, notes, created_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             ON CONFLICT (group_id, scene_type_id, prompt_slot_id)
             DO UPDATE SET fragments = EXCLUDED.fragments,
                           override_text = EXCLUDED.override_text,
                           notes = EXCLUDED.notes
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, GroupPromptOverride>(&query)
            .bind(input.group_id)
            .bind(input.scene_type_id)
            .bind(input.prompt_slot_id)
            .bind(&input.fragments)
            .bind(&input.override_text)
            .bind(&input.notes)
            .bind(input.created_by)
            .fetch_one(pool)
            .await
    }

    /// List all overrides for a group + scene type pair, ordered by slot.
    pub async fn list_by_group_and_scene_type(
        pool: &PgPool,
        group_id: DbId,
        scene_type_id: DbId,
    ) -> Result<Vec<GroupPromptOverride>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM group_prompt_overrides \
             WHERE group_id = $1 AND scene_type_id = $2 ORDER BY prompt_slot_id"
        );
        sqlx::query_as::<_, GroupPromptOverride>(&query)
            .bind(group_id)
            .bind(scene_type_id)
            .fetch_all(pool)
            .await
    }

    /// List all overrides for a group, ordered by scene type and slot.
    pub async fn list_by_group(
        pool: &PgPool,
        group_id: DbId,
    ) -> Result<Vec<GroupPromptOverride>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM group_prompt_overrides \
             WHERE group_id = $1 ORDER BY scene_type_id, prompt_slot_id"
        );
        sqlx::query_as::<_, GroupPromptOverride>(&query)
            .bind(group_id)
            .fetch_all(pool)
            .await
    }

    /// Delete an override by ID. Returns `true` if a row was removed.
    pub async fn delete(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error> {
        let result = sqlx::query("DELETE FROM group_prompt_overrides WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected() > 0)
    }
}
