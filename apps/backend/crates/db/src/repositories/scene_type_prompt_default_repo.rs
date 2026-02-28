//! Repository for the `scene_type_prompt_defaults` table (PRD-115).

use sqlx::PgPool;
use x121_core::types::DbId;

use crate::models::scene_type_prompt_default::{
    CreateSceneTypePromptDefault, SceneTypePromptDefault,
};

/// Column list for the `scene_type_prompt_defaults` table.
const COLUMNS: &str = "id, scene_type_id, prompt_slot_id, prompt_text, created_at, updated_at";

/// Provides data access for scene type prompt defaults.
pub struct SceneTypePromptDefaultRepo;

impl SceneTypePromptDefaultRepo {
    /// Insert or update a scene type prompt default.
    ///
    /// Uses the unique constraint on `(scene_type_id, prompt_slot_id)` to
    /// upsert: if a row already exists the `prompt_text` is updated.
    pub async fn upsert(
        pool: &PgPool,
        input: &CreateSceneTypePromptDefault,
    ) -> Result<SceneTypePromptDefault, sqlx::Error> {
        let query = format!(
            "INSERT INTO scene_type_prompt_defaults
                (scene_type_id, prompt_slot_id, prompt_text)
             VALUES ($1, $2, $3)
             ON CONFLICT (scene_type_id, prompt_slot_id)
             DO UPDATE SET prompt_text = EXCLUDED.prompt_text
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, SceneTypePromptDefault>(&query)
            .bind(input.scene_type_id)
            .bind(input.prompt_slot_id)
            .bind(&input.prompt_text)
            .fetch_one(pool)
            .await
    }

    /// List all prompt defaults for a scene type, ordered by slot ID.
    pub async fn list_by_scene_type(
        pool: &PgPool,
        scene_type_id: DbId,
    ) -> Result<Vec<SceneTypePromptDefault>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM scene_type_prompt_defaults \
             WHERE scene_type_id = $1 ORDER BY prompt_slot_id"
        );
        sqlx::query_as::<_, SceneTypePromptDefault>(&query)
            .bind(scene_type_id)
            .fetch_all(pool)
            .await
    }

    /// Delete a scene type prompt default by its primary key.
    /// Returns `true` if a row was removed.
    pub async fn delete(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error> {
        let result = sqlx::query("DELETE FROM scene_type_prompt_defaults WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected() > 0)
    }
}
