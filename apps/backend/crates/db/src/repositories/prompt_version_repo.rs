//! Repository for the `prompt_versions` table (PRD-63).

use sqlx::PgPool;
use trulience_core::types::DbId;

use crate::models::prompt_version::{CreatePromptVersion, PromptVersion};

/// Column list for prompt_versions queries.
const COLUMNS: &str = "id, scene_type_id, version, positive_prompt, negative_prompt, \
    change_notes, created_by_id, created_at, updated_at";

/// Provides CRUD operations for prompt versions.
pub struct PromptVersionRepo;

impl PromptVersionRepo {
    /// Insert a new prompt version, auto-incrementing the version number
    /// for the given scene type. Returns the created row.
    pub async fn create(
        pool: &PgPool,
        input: &CreatePromptVersion,
    ) -> Result<PromptVersion, sqlx::Error> {
        let query = format!(
            "INSERT INTO prompt_versions
                (scene_type_id, version, positive_prompt, negative_prompt,
                 change_notes, created_by_id)
             VALUES ($1,
                     COALESCE((SELECT MAX(version) FROM prompt_versions WHERE scene_type_id = $1), 0) + 1,
                     $2, $3, $4, $5)
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, PromptVersion>(&query)
            .bind(input.scene_type_id)
            .bind(&input.positive_prompt)
            .bind(&input.negative_prompt)
            .bind(&input.change_notes)
            .bind(input.created_by_id)
            .fetch_one(pool)
            .await
    }

    /// Find a prompt version by its primary key.
    pub async fn find_by_id(
        pool: &PgPool,
        id: DbId,
    ) -> Result<Option<PromptVersion>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM prompt_versions WHERE id = $1"
        );
        sqlx::query_as::<_, PromptVersion>(&query)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// List prompt versions for a scene type with pagination, newest first.
    pub async fn list_for_scene_type(
        pool: &PgPool,
        scene_type_id: DbId,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<PromptVersion>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM prompt_versions
             WHERE scene_type_id = $1
             ORDER BY version DESC
             LIMIT $2 OFFSET $3"
        );
        sqlx::query_as::<_, PromptVersion>(&query)
            .bind(scene_type_id)
            .bind(limit)
            .bind(offset)
            .fetch_all(pool)
            .await
    }

    /// Find a specific version by scene type and version number.
    pub async fn find_by_scene_type_and_version(
        pool: &PgPool,
        scene_type_id: DbId,
        version: i32,
    ) -> Result<Option<PromptVersion>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM prompt_versions
             WHERE scene_type_id = $1 AND version = $2"
        );
        sqlx::query_as::<_, PromptVersion>(&query)
            .bind(scene_type_id)
            .bind(version)
            .fetch_optional(pool)
            .await
    }

    /// Get the latest (highest version number) prompt version for a scene type.
    pub async fn get_latest(
        pool: &PgPool,
        scene_type_id: DbId,
    ) -> Result<Option<PromptVersion>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM prompt_versions
             WHERE scene_type_id = $1
             ORDER BY version DESC
             LIMIT 1"
        );
        sqlx::query_as::<_, PromptVersion>(&query)
            .bind(scene_type_id)
            .fetch_optional(pool)
            .await
    }

    /// Count the total number of prompt versions for a scene type.
    pub async fn count_for_scene_type(
        pool: &PgPool,
        scene_type_id: DbId,
    ) -> Result<i64, sqlx::Error> {
        let row: (i64,) =
            sqlx::query_as("SELECT COUNT(*) FROM prompt_versions WHERE scene_type_id = $1")
                .bind(scene_type_id)
                .fetch_one(pool)
                .await?;
        Ok(row.0)
    }
}
