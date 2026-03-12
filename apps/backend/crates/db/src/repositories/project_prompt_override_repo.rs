//! Repository for the `project_prompt_overrides` table.

use sqlx::PgPool;
use x121_core::types::DbId;

use crate::models::project_prompt_override::{CreateProjectPromptOverride, ProjectPromptOverride};

/// Column list for the `project_prompt_overrides` table.
const COLUMNS: &str = "id, project_id, scene_type_id, prompt_slot_id, fragments, \
    override_text, notes, created_by, created_at, updated_at";

/// Provides data access for project-level prompt overrides.
pub struct ProjectPromptOverrideRepo;

impl ProjectPromptOverrideRepo {
    /// Insert or update a project prompt override.
    ///
    /// Uses the unique constraint on `(project_id, scene_type_id, prompt_slot_id)`
    /// to upsert: if a row already exists the `fragments` and `notes` are updated.
    pub async fn upsert(
        pool: &PgPool,
        input: &CreateProjectPromptOverride,
    ) -> Result<ProjectPromptOverride, sqlx::Error> {
        let query = format!(
            "INSERT INTO project_prompt_overrides
                (project_id, scene_type_id, prompt_slot_id, fragments, override_text, notes, created_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             ON CONFLICT (project_id, scene_type_id, prompt_slot_id)
             DO UPDATE SET fragments = EXCLUDED.fragments,
                           override_text = EXCLUDED.override_text,
                           notes = EXCLUDED.notes
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, ProjectPromptOverride>(&query)
            .bind(input.project_id)
            .bind(input.scene_type_id)
            .bind(input.prompt_slot_id)
            .bind(&input.fragments)
            .bind(&input.override_text)
            .bind(&input.notes)
            .bind(input.created_by)
            .fetch_one(pool)
            .await
    }

    /// List all overrides for a project + scene type pair, ordered by slot.
    pub async fn list_by_project_and_scene_type(
        pool: &PgPool,
        project_id: DbId,
        scene_type_id: DbId,
    ) -> Result<Vec<ProjectPromptOverride>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM project_prompt_overrides \
             WHERE project_id = $1 AND scene_type_id = $2 ORDER BY prompt_slot_id"
        );
        sqlx::query_as::<_, ProjectPromptOverride>(&query)
            .bind(project_id)
            .bind(scene_type_id)
            .fetch_all(pool)
            .await
    }

    /// List all overrides for a project, ordered by scene type and slot.
    pub async fn list_by_project(
        pool: &PgPool,
        project_id: DbId,
    ) -> Result<Vec<ProjectPromptOverride>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM project_prompt_overrides \
             WHERE project_id = $1 ORDER BY scene_type_id, prompt_slot_id"
        );
        sqlx::query_as::<_, ProjectPromptOverride>(&query)
            .bind(project_id)
            .fetch_all(pool)
            .await
    }

    /// Delete an override by ID. Returns `true` if a row was removed.
    pub async fn delete(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error> {
        let result = sqlx::query("DELETE FROM project_prompt_overrides WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected() > 0)
    }
}
