//! Repository for the `character_groups` table.

use sqlx::PgPool;
use x121_core::types::DbId;

use crate::models::character_group::{CharacterGroup, CreateCharacterGroup, UpdateCharacterGroup};

/// Column list shared across queries to avoid repetition.
const COLUMNS: &str = "id, project_id, name, sort_order, deleted_at, created_at, updated_at";

/// Provides CRUD operations for character groups.
pub struct CharacterGroupRepo;

impl CharacterGroupRepo {
    /// Insert a new character group, returning the created row.
    pub async fn create(
        pool: &PgPool,
        input: &CreateCharacterGroup,
    ) -> Result<CharacterGroup, sqlx::Error> {
        let query = format!(
            "INSERT INTO character_groups (project_id, name, sort_order)
             VALUES ($1, $2, COALESCE($3, 0))
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, CharacterGroup>(&query)
            .bind(input.project_id)
            .bind(&input.name)
            .bind(input.sort_order)
            .fetch_one(pool)
            .await
    }

    /// Find a character group by ID. Excludes soft-deleted rows.
    pub async fn find_by_id(
        pool: &PgPool,
        id: DbId,
    ) -> Result<Option<CharacterGroup>, sqlx::Error> {
        let query =
            format!("SELECT {COLUMNS} FROM character_groups WHERE id = $1 AND deleted_at IS NULL");
        sqlx::query_as::<_, CharacterGroup>(&query)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// List all groups for a project, ordered by sort_order then name. Excludes soft-deleted.
    pub async fn list_by_project(
        pool: &PgPool,
        project_id: DbId,
    ) -> Result<Vec<CharacterGroup>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM character_groups
             WHERE project_id = $1 AND deleted_at IS NULL
             ORDER BY sort_order ASC, name ASC"
        );
        sqlx::query_as::<_, CharacterGroup>(&query)
            .bind(project_id)
            .fetch_all(pool)
            .await
    }

    /// Update a character group. Only non-`None` fields are applied.
    pub async fn update(
        pool: &PgPool,
        id: DbId,
        input: &UpdateCharacterGroup,
    ) -> Result<Option<CharacterGroup>, sqlx::Error> {
        let query = format!(
            "UPDATE character_groups SET
                name = COALESCE($2, name),
                sort_order = COALESCE($3, sort_order)
             WHERE id = $1 AND deleted_at IS NULL
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, CharacterGroup>(&query)
            .bind(id)
            .bind(&input.name)
            .bind(input.sort_order)
            .fetch_optional(pool)
            .await
    }

    /// Soft-delete a group by ID. Ungroups all characters in the group first,
    /// then marks the group as deleted. Returns `true` if a row was marked deleted.
    pub async fn soft_delete(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error> {
        sqlx::query("UPDATE characters SET group_id = NULL WHERE group_id = $1")
            .bind(id)
            .execute(pool)
            .await?;
        let result = sqlx::query(
            "UPDATE character_groups SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL",
        )
        .bind(id)
        .execute(pool)
        .await?;
        Ok(result.rows_affected() > 0)
    }

    /// Restore a soft-deleted group. Returns `true` if a row was restored.
    pub async fn restore(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error> {
        let result = sqlx::query(
            "UPDATE character_groups SET deleted_at = NULL WHERE id = $1 AND deleted_at IS NOT NULL",
        )
        .bind(id)
        .execute(pool)
        .await?;
        Ok(result.rows_affected() > 0)
    }

    /// Permanently delete a group by ID. Returns `true` if a row was removed.
    pub async fn hard_delete(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error> {
        let result = sqlx::query("DELETE FROM character_groups WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected() > 0)
    }
}
