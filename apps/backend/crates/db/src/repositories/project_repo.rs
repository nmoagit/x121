//! Repository for the `projects` table.

use sqlx::PgPool;
use trulience_core::types::DbId;

use crate::models::project::{CreateProject, Project, UpdateProject};

/// Provides CRUD operations for projects.
pub struct ProjectRepo;

impl ProjectRepo {
    /// Insert a new project, returning the created row.
    ///
    /// If `status_id` is `None` in the input, defaults to 1 (Draft).
    pub async fn create(pool: &PgPool, input: &CreateProject) -> Result<Project, sqlx::Error> {
        sqlx::query_as::<_, Project>(
            "INSERT INTO projects (name, description, status_id, retention_days)
             VALUES ($1, $2, COALESCE($3, 1), $4)
             RETURNING id, name, description, status_id, retention_days, created_at, updated_at",
        )
        .bind(&input.name)
        .bind(&input.description)
        .bind(input.status_id)
        .bind(input.retention_days)
        .fetch_one(pool)
        .await
    }

    /// Find a project by its internal ID.
    pub async fn find_by_id(pool: &PgPool, id: DbId) -> Result<Option<Project>, sqlx::Error> {
        sqlx::query_as::<_, Project>(
            "SELECT id, name, description, status_id, retention_days, created_at, updated_at
             FROM projects
             WHERE id = $1",
        )
        .bind(id)
        .fetch_optional(pool)
        .await
    }

    /// List all projects ordered by most recently created first.
    pub async fn list(pool: &PgPool) -> Result<Vec<Project>, sqlx::Error> {
        sqlx::query_as::<_, Project>(
            "SELECT id, name, description, status_id, retention_days, created_at, updated_at
             FROM projects
             ORDER BY created_at DESC",
        )
        .fetch_all(pool)
        .await
    }

    /// Update a project. Only non-`None` fields in `input` are applied.
    ///
    /// Returns `None` if no row with the given `id` exists.
    pub async fn update(
        pool: &PgPool,
        id: DbId,
        input: &UpdateProject,
    ) -> Result<Option<Project>, sqlx::Error> {
        sqlx::query_as::<_, Project>(
            "UPDATE projects SET
                name = COALESCE($2, name),
                description = COALESCE($3, description),
                status_id = COALESCE($4, status_id),
                retention_days = COALESCE($5, retention_days)
             WHERE id = $1
             RETURNING id, name, description, status_id, retention_days, created_at, updated_at",
        )
        .bind(id)
        .bind(&input.name)
        .bind(&input.description)
        .bind(input.status_id)
        .bind(input.retention_days)
        .fetch_optional(pool)
        .await
    }

    /// Delete a project by ID. Returns `true` if a row was removed.
    pub async fn delete(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error> {
        let result = sqlx::query("DELETE FROM projects WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected() > 0)
    }
}
