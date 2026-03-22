//! Repository for the `avatar_groups` table.

use sqlx::PgPool;
use x121_core::types::DbId;

use crate::models::avatar_group::{AvatarGroup, CreateAvatarGroup, UpdateAvatarGroup};

/// Column list shared across queries to avoid repetition.
const COLUMNS: &str =
    "id, project_id, name, sort_order, blocking_deliverables, deleted_at, created_at, updated_at";

/// Provides CRUD operations for avatar groups.
pub struct AvatarGroupRepo;

impl AvatarGroupRepo {
    /// Insert a new avatar group, returning the created row.
    pub async fn create(
        pool: &PgPool,
        input: &CreateAvatarGroup,
    ) -> Result<AvatarGroup, sqlx::Error> {
        let query = format!(
            "INSERT INTO avatar_groups (project_id, name, sort_order)
             VALUES ($1, $2, COALESCE($3, 0))
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, AvatarGroup>(&query)
            .bind(input.project_id)
            .bind(&input.name)
            .bind(input.sort_order)
            .fetch_one(pool)
            .await
    }

    /// Default group name created automatically for projects with no groups.
    pub const DEFAULT_GROUP_NAME: &'static str = "Intake";

    /// Ensure the project has at least one group. If none exist, create
    /// a default "Intake" group and return it. Otherwise return `None`.
    pub async fn ensure_default(
        pool: &PgPool,
        project_id: DbId,
    ) -> Result<Option<AvatarGroup>, sqlx::Error> {
        // Check if any non-deleted groups exist
        let count: (i64,) = sqlx::query_as(
            "SELECT COUNT(*) FROM avatar_groups WHERE project_id = $1 AND deleted_at IS NULL",
        )
        .bind(project_id)
        .fetch_one(pool)
        .await?;

        if count.0 > 0 {
            return Ok(None);
        }

        // No groups — create the default
        let group = Self::create(
            pool,
            &CreateAvatarGroup {
                project_id,
                name: Self::DEFAULT_GROUP_NAME.to_string(),
                sort_order: Some(0),
            },
        )
        .await?;

        // Assign any existing ungrouped avatars in this project to the new group
        sqlx::query(
            "UPDATE avatars SET group_id = $1 WHERE project_id = $2 AND group_id IS NULL AND deleted_at IS NULL",
        )
        .bind(group.id)
        .bind(project_id)
        .execute(pool)
        .await?;

        Ok(Some(group))
    }

    /// Find a avatar group by ID. Excludes soft-deleted rows.
    pub async fn find_by_id(
        pool: &PgPool,
        id: DbId,
    ) -> Result<Option<AvatarGroup>, sqlx::Error> {
        let query =
            format!("SELECT {COLUMNS} FROM avatar_groups WHERE id = $1 AND deleted_at IS NULL");
        sqlx::query_as::<_, AvatarGroup>(&query)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// List all groups for a project, ordered by sort_order then name. Excludes soft-deleted.
    pub async fn list_by_project(
        pool: &PgPool,
        project_id: DbId,
    ) -> Result<Vec<AvatarGroup>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM avatar_groups
             WHERE project_id = $1 AND deleted_at IS NULL
             ORDER BY sort_order ASC, name ASC"
        );
        sqlx::query_as::<_, AvatarGroup>(&query)
            .bind(project_id)
            .fetch_all(pool)
            .await
    }

    /// Update a avatar group. Only non-`None` fields are applied.
    pub async fn update(
        pool: &PgPool,
        id: DbId,
        input: &UpdateAvatarGroup,
    ) -> Result<Option<AvatarGroup>, sqlx::Error> {
        let (bd_value, bd_set_null) = crate::resolve_nullable_array(&input.blocking_deliverables);

        let query = format!(
            "UPDATE avatar_groups SET
                name = COALESCE($2, name),
                sort_order = COALESCE($3, sort_order),
                blocking_deliverables = CASE
                    WHEN $5 THEN NULL
                    ELSE COALESCE($4, blocking_deliverables)
                END
             WHERE id = $1 AND deleted_at IS NULL
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, AvatarGroup>(&query)
            .bind(id)
            .bind(&input.name)
            .bind(input.sort_order)
            .bind(&bd_value)
            .bind(bd_set_null)
            .fetch_optional(pool)
            .await
    }

    /// Soft-delete a group by ID. Ungroups all avatars in the group first,
    /// then marks the group as deleted. Returns `true` if a row was marked deleted.
    pub async fn soft_delete(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error> {
        sqlx::query("UPDATE avatars SET group_id = NULL WHERE group_id = $1")
            .bind(id)
            .execute(pool)
            .await?;
        let result = sqlx::query(
            "UPDATE avatar_groups SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL",
        )
        .bind(id)
        .execute(pool)
        .await?;
        Ok(result.rows_affected() > 0)
    }

    /// Restore a soft-deleted group. Returns `true` if a row was restored.
    pub async fn restore(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error> {
        let result = sqlx::query(
            "UPDATE avatar_groups SET deleted_at = NULL WHERE id = $1 AND deleted_at IS NOT NULL",
        )
        .bind(id)
        .execute(pool)
        .await?;
        Ok(result.rows_affected() > 0)
    }

    /// Permanently delete a group by ID. Returns `true` if a row was removed.
    pub async fn hard_delete(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error> {
        let result = sqlx::query("DELETE FROM avatar_groups WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected() > 0)
    }
}
