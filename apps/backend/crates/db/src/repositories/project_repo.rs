//! Repository for the `projects` table.

use sqlx::PgPool;
use x121_core::types::DbId;

use crate::models::project::{CreateProject, Project, UpdateProject};

/// Column list shared across queries to avoid repetition.
const COLUMNS: &str =
    "id, name, description, status_id, retention_days, deleted_at, created_at, updated_at";

/// Provides CRUD operations for projects.
pub struct ProjectRepo;

impl ProjectRepo {
    /// Insert a new project, returning the created row.
    ///
    /// If `status_id` is `None` in the input, defaults to 1 (Draft).
    pub async fn create(pool: &PgPool, input: &CreateProject) -> Result<Project, sqlx::Error> {
        let query = format!(
            "INSERT INTO projects (name, description, status_id, retention_days)
             VALUES ($1, $2, COALESCE($3, 1), $4)
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, Project>(&query)
            .bind(&input.name)
            .bind(&input.description)
            .bind(input.status_id)
            .bind(input.retention_days)
            .fetch_one(pool)
            .await
    }

    /// Find a project by its internal ID. Excludes soft-deleted rows.
    pub async fn find_by_id(pool: &PgPool, id: DbId) -> Result<Option<Project>, sqlx::Error> {
        let query = format!("SELECT {COLUMNS} FROM projects WHERE id = $1 AND deleted_at IS NULL");
        sqlx::query_as::<_, Project>(&query)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// List all projects ordered by most recently created first. Excludes soft-deleted rows.
    pub async fn list(pool: &PgPool) -> Result<Vec<Project>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM projects WHERE deleted_at IS NULL ORDER BY created_at DESC"
        );
        sqlx::query_as::<_, Project>(&query).fetch_all(pool).await
    }

    /// Update a project. Only non-`None` fields in `input` are applied.
    ///
    /// Returns `None` if no row with the given `id` exists.
    pub async fn update(
        pool: &PgPool,
        id: DbId,
        input: &UpdateProject,
    ) -> Result<Option<Project>, sqlx::Error> {
        let query = format!(
            "UPDATE projects SET
                name = COALESCE($2, name),
                description = COALESCE($3, description),
                status_id = COALESCE($4, status_id),
                retention_days = COALESCE($5, retention_days)
             WHERE id = $1 AND deleted_at IS NULL
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, Project>(&query)
            .bind(id)
            .bind(&input.name)
            .bind(&input.description)
            .bind(input.status_id)
            .bind(input.retention_days)
            .fetch_optional(pool)
            .await
    }

    /// Soft-delete a project by ID. Returns `true` if a row was marked deleted.
    pub async fn soft_delete(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error> {
        let result = sqlx::query(
            "UPDATE projects SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL",
        )
        .bind(id)
        .execute(pool)
        .await?;
        Ok(result.rows_affected() > 0)
    }

    /// Restore a soft-deleted project. Returns `true` if a row was restored.
    pub async fn restore(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error> {
        let result = sqlx::query(
            "UPDATE projects SET deleted_at = NULL WHERE id = $1 AND deleted_at IS NOT NULL",
        )
        .bind(id)
        .execute(pool)
        .await?;
        Ok(result.rows_affected() > 0)
    }

    /// Find a project by ID, including soft-deleted rows. Used for parent-check on restore.
    pub async fn find_by_id_include_deleted(
        pool: &PgPool,
        id: DbId,
    ) -> Result<Option<Project>, sqlx::Error> {
        let query = format!("SELECT {COLUMNS} FROM projects WHERE id = $1");
        sqlx::query_as::<_, Project>(&query)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// Permanently delete a project by ID. Returns `true` if a row was removed.
    pub async fn hard_delete(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error> {
        let result = sqlx::query("DELETE FROM projects WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected() > 0)
    }
}
