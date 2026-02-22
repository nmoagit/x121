//! Repository for the `templates` table (PRD-27).

use sqlx::PgPool;
use trulience_core::types::DbId;

use crate::models::template::{CreateTemplate, Template, UpdateTemplate};

const COLUMNS: &str = "id, name, description, owner_id, scope, project_id, \
     workflow_config, parameter_slots, version, is_active, created_at, updated_at";

/// Provides CRUD operations for templates.
pub struct TemplateRepo;

impl TemplateRepo {
    /// Insert a new template, returning the created row.
    pub async fn create(
        pool: &PgPool,
        owner_id: DbId,
        input: &CreateTemplate,
    ) -> Result<Template, sqlx::Error> {
        let query = format!(
            "INSERT INTO templates \
                (name, description, owner_id, scope, project_id, workflow_config, parameter_slots) \
             VALUES ($1, $2, $3, COALESCE($4, 'personal'), $5, $6, $7) \
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, Template>(&query)
            .bind(&input.name)
            .bind(&input.description)
            .bind(owner_id)
            .bind(&input.scope)
            .bind(input.project_id)
            .bind(&input.workflow_config)
            .bind(&input.parameter_slots)
            .fetch_one(pool)
            .await
    }

    /// Find a template by ID.
    pub async fn find_by_id(
        pool: &PgPool,
        id: DbId,
    ) -> Result<Option<Template>, sqlx::Error> {
        let query = format!("SELECT {COLUMNS} FROM templates WHERE id = $1");
        sqlx::query_as::<_, Template>(&query)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// List templates visible to a user: their own personal templates,
    /// project-scoped templates for the given project, and all studio-scoped.
    pub async fn list_for_user(
        pool: &PgPool,
        user_id: DbId,
        project_id: Option<DbId>,
    ) -> Result<Vec<Template>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM templates \
             WHERE is_active = true \
               AND ( \
                   (scope = 'personal' AND owner_id = $1) \
                   OR (scope = 'project' AND project_id = $2) \
                   OR scope = 'studio' \
               ) \
             ORDER BY name ASC"
        );
        sqlx::query_as::<_, Template>(&query)
            .bind(user_id)
            .bind(project_id)
            .fetch_all(pool)
            .await
    }

    /// Update a template. Only non-`None` fields are applied. Increments version.
    pub async fn update(
        pool: &PgPool,
        id: DbId,
        input: &UpdateTemplate,
    ) -> Result<Option<Template>, sqlx::Error> {
        let query = format!(
            "UPDATE templates SET \
                name = COALESCE($2, name), \
                description = COALESCE($3, description), \
                scope = COALESCE($4, scope), \
                project_id = COALESCE($5, project_id), \
                workflow_config = COALESCE($6, workflow_config), \
                parameter_slots = COALESCE($7, parameter_slots), \
                version = version + 1 \
             WHERE id = $1 \
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, Template>(&query)
            .bind(id)
            .bind(&input.name)
            .bind(&input.description)
            .bind(&input.scope)
            .bind(input.project_id)
            .bind(&input.workflow_config)
            .bind(&input.parameter_slots)
            .fetch_optional(pool)
            .await
    }

    /// Soft-deactivate a template (set is_active = false).
    pub async fn deactivate(
        pool: &PgPool,
        id: DbId,
    ) -> Result<bool, sqlx::Error> {
        let result = sqlx::query(
            "UPDATE templates SET is_active = false WHERE id = $1 AND is_active = true",
        )
        .bind(id)
        .execute(pool)
        .await?;
        Ok(result.rows_affected() > 0)
    }

    /// Hard-delete a template by ID. Returns `true` if a row was removed.
    pub async fn delete(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error> {
        let result = sqlx::query("DELETE FROM templates WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected() > 0)
    }
}
