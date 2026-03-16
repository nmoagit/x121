//! Repository for the `projects` table.

use sqlx::PgPool;
use x121_core::types::DbId;

use crate::models::project::{CreateProject, Project, UpdateProject};

/// Column list shared across queries to avoid repetition.
const COLUMNS: &str =
    "id, name, description, status_id, retention_days, auto_deliver_on_final, deleted_at, created_at, updated_at, \
     review_trigger_threshold, blocking_deliverables";

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
            "SELECT {COLUMNS} FROM projects WHERE deleted_at IS NULL ORDER BY LOWER(name) ASC"
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
        // blocking_deliverables: None = don't change, Some([]) = reset to NULL (inherit),
        // Some([...]) = set override.
        let bd_value: Option<Vec<String>> = match &input.blocking_deliverables {
            None => None,                    // field absent → keep existing
            Some(v) if v.is_empty() => None, // empty array → will set NULL
            Some(v) => Some(v.clone()),      // non-empty → set override
        };
        let bd_set_null = matches!(&input.blocking_deliverables, Some(v) if v.is_empty());

        let query = format!(
            "UPDATE projects SET
                name = COALESCE($2, name),
                description = COALESCE($3, description),
                status_id = COALESCE($4, status_id),
                retention_days = COALESCE($5, retention_days),
                auto_deliver_on_final = COALESCE($6, auto_deliver_on_final),
                blocking_deliverables = CASE
                    WHEN $8 THEN NULL
                    ELSE COALESCE($7, blocking_deliverables)
                END
             WHERE id = $1 AND deleted_at IS NULL
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, Project>(&query)
            .bind(id)
            .bind(&input.name)
            .bind(&input.description)
            .bind(input.status_id)
            .bind(input.retention_days)
            .bind(input.auto_deliver_on_final)
            .bind(&bd_value)
            .bind(bd_set_null)
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
