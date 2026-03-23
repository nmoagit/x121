//! Repository for the `metadata_templates` and `metadata_template_fields` tables (PRD-113).

use sqlx::PgPool;
use x121_core::types::DbId;

use crate::models::metadata_template::{
    CreateMetadataTemplate, CreateMetadataTemplateField, MetadataTemplate, MetadataTemplateField,
    UpdateMetadataTemplate,
};

/// Column list for `metadata_templates`.
const TEMPLATE_COLUMNS: &str =
    "id, name, description, project_id, pipeline_id, is_default, version, created_at, updated_at";

/// Column list for `metadata_template_fields`.
const FIELD_COLUMNS: &str =
    "id, template_id, field_name, field_type, is_required, constraints, description, sort_order, \
     created_at, updated_at";

/// CRUD operations for metadata templates.
pub struct MetadataTemplateRepo;

impl MetadataTemplateRepo {
    /// Insert a new template, returning the created row.
    pub async fn create(
        pool: &PgPool,
        input: &CreateMetadataTemplate,
    ) -> Result<MetadataTemplate, sqlx::Error> {
        let query = format!(
            "INSERT INTO metadata_templates (name, description, project_id, pipeline_id, is_default)
             VALUES ($1, $2, $3, $4, COALESCE($5, false))
             RETURNING {TEMPLATE_COLUMNS}"
        );
        sqlx::query_as::<_, MetadataTemplate>(&query)
            .bind(&input.name)
            .bind(&input.description)
            .bind(input.project_id)
            .bind(input.pipeline_id)
            .bind(input.is_default)
            .fetch_one(pool)
            .await
    }

    /// Find a template by ID.
    pub async fn find_by_id(
        pool: &PgPool,
        id: DbId,
    ) -> Result<Option<MetadataTemplate>, sqlx::Error> {
        let query = format!("SELECT {TEMPLATE_COLUMNS} FROM metadata_templates WHERE id = $1");
        sqlx::query_as::<_, MetadataTemplate>(&query)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// Find the default template using 3-tier resolution: Project -> Pipeline -> Global.
    ///
    /// If `project_id` is provided, first checks for a project-level default.
    /// If none, checks the pipeline-level default (using `pipeline_id`).
    /// Falls back to the global default (no project_id, no pipeline_id).
    pub async fn find_default(
        pool: &PgPool,
        project_id: Option<DbId>,
        pipeline_id: Option<DbId>,
    ) -> Result<Option<MetadataTemplate>, sqlx::Error> {
        // 3-tier priority: project_id match > pipeline_id match > global
        let query = format!(
            "SELECT {TEMPLATE_COLUMNS} FROM metadata_templates
             WHERE is_default = true
               AND (
                   project_id = $1
                   OR (project_id IS NULL AND pipeline_id = $2)
                   OR (project_id IS NULL AND pipeline_id IS NULL)
               )
             ORDER BY
               project_id IS NOT NULL DESC,
               pipeline_id IS NOT NULL DESC
             LIMIT 1"
        );
        sqlx::query_as::<_, MetadataTemplate>(&query)
            .bind(project_id)
            .bind(pipeline_id)
            .fetch_optional(pool)
            .await
    }

    /// List templates, optionally filtered by project and/or pipeline.
    pub async fn list(
        pool: &PgPool,
        project_id: Option<DbId>,
        pipeline_id: Option<DbId>,
    ) -> Result<Vec<MetadataTemplate>, sqlx::Error> {
        let query = format!(
            "SELECT {TEMPLATE_COLUMNS} FROM metadata_templates
             WHERE ($1::BIGINT IS NULL OR project_id = $1 OR project_id IS NULL)
               AND ($2::BIGINT IS NULL OR pipeline_id = $2 OR pipeline_id IS NULL)
             ORDER BY name ASC"
        );
        sqlx::query_as::<_, MetadataTemplate>(&query)
            .bind(project_id)
            .bind(pipeline_id)
            .fetch_all(pool)
            .await
    }

    /// Update a template. Only non-`None` fields are applied.
    pub async fn update(
        pool: &PgPool,
        id: DbId,
        input: &UpdateMetadataTemplate,
    ) -> Result<Option<MetadataTemplate>, sqlx::Error> {
        let query = format!(
            "UPDATE metadata_templates SET
                name = COALESCE($2, name),
                description = COALESCE($3, description),
                is_default = COALESCE($4, is_default)
             WHERE id = $1
             RETURNING {TEMPLATE_COLUMNS}"
        );
        sqlx::query_as::<_, MetadataTemplate>(&query)
            .bind(id)
            .bind(&input.name)
            .bind(&input.description)
            .bind(input.is_default)
            .fetch_optional(pool)
            .await
    }

    /// Delete a template by ID. Returns true if a row was removed.
    pub async fn delete(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error> {
        let result = sqlx::query("DELETE FROM metadata_templates WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected() > 0)
    }
}

/// CRUD operations for metadata template fields.
pub struct MetadataTemplateFieldRepo;

impl MetadataTemplateFieldRepo {
    /// Insert a new field, returning the created row.
    pub async fn create(
        pool: &PgPool,
        input: &CreateMetadataTemplateField,
    ) -> Result<MetadataTemplateField, sqlx::Error> {
        let query = format!(
            "INSERT INTO metadata_template_fields
                 (template_id, field_name, field_type, is_required, constraints, description, sort_order)
             VALUES ($1, $2, $3, COALESCE($4, false), COALESCE($5, '{{}}'::jsonb), $6, COALESCE($7, 0))
             RETURNING {FIELD_COLUMNS}"
        );
        sqlx::query_as::<_, MetadataTemplateField>(&query)
            .bind(input.template_id)
            .bind(&input.field_name)
            .bind(&input.field_type)
            .bind(input.is_required)
            .bind(&input.constraints)
            .bind(&input.description)
            .bind(input.sort_order)
            .fetch_one(pool)
            .await
    }

    /// List fields for a template, ordered by sort_order.
    pub async fn list_by_template(
        pool: &PgPool,
        template_id: DbId,
    ) -> Result<Vec<MetadataTemplateField>, sqlx::Error> {
        let query = format!(
            "SELECT {FIELD_COLUMNS} FROM metadata_template_fields
             WHERE template_id = $1
             ORDER BY sort_order ASC, id ASC"
        );
        sqlx::query_as::<_, MetadataTemplateField>(&query)
            .bind(template_id)
            .fetch_all(pool)
            .await
    }

    /// Delete a single field by ID. Returns true if a row was removed.
    pub async fn delete(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error> {
        let result = sqlx::query("DELETE FROM metadata_template_fields WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected() > 0)
    }

    /// Delete all fields for a template.
    pub async fn delete_by_template(pool: &PgPool, template_id: DbId) -> Result<u64, sqlx::Error> {
        let result = sqlx::query("DELETE FROM metadata_template_fields WHERE template_id = $1")
            .bind(template_id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected())
    }
}
