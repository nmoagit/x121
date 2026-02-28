//! Repository for sidecar templates and dataset exports (PRD-40).
//!
//! Provides CRUD operations for `sidecar_templates` and `dataset_exports`.

use sqlx::PgPool;
use x121_core::search::{clamp_limit, clamp_offset, DEFAULT_SEARCH_LIMIT, MAX_SEARCH_LIMIT};
use x121_core::sidecar::JOB_STATUS_ID_PENDING;
use x121_core::types::DbId;

use crate::models::sidecar::{
    CreateDatasetExport, CreateSidecarTemplate, DatasetExport, SidecarTemplate,
    UpdateSidecarTemplate,
};

/// Column list for `sidecar_templates` queries.
const TEMPLATE_COLUMNS: &str = "id, name, description, format, target_tool, \
    template_json, is_builtin, created_by, created_at, updated_at";

/// Column list for `dataset_exports` queries.
const EXPORT_COLUMNS: &str = "id, project_id, name, config_json, manifest_json, \
    file_path, file_size_bytes, sample_count, status_id, exported_by, \
    created_at, updated_at";

/// Provides data access for sidecar templates and dataset exports.
pub struct SidecarRepo;

impl SidecarRepo {
    // -----------------------------------------------------------------------
    // Sidecar templates
    // -----------------------------------------------------------------------

    /// Create a new sidecar template, returning the created row.
    pub async fn create_template(
        pool: &PgPool,
        user_id: DbId,
        input: &CreateSidecarTemplate,
    ) -> Result<SidecarTemplate, sqlx::Error> {
        let query = format!(
            "INSERT INTO sidecar_templates \
                (name, description, format, target_tool, template_json, created_by) \
             VALUES ($1, $2, $3, $4, $5, $6) \
             RETURNING {TEMPLATE_COLUMNS}"
        );
        sqlx::query_as::<_, SidecarTemplate>(&query)
            .bind(&input.name)
            .bind(&input.description)
            .bind(&input.format)
            .bind(&input.target_tool)
            .bind(&input.template_json)
            .bind(user_id)
            .fetch_one(pool)
            .await
    }

    /// Find a sidecar template by its ID.
    pub async fn get_template(
        pool: &PgPool,
        id: DbId,
    ) -> Result<Option<SidecarTemplate>, sqlx::Error> {
        let query = format!("SELECT {TEMPLATE_COLUMNS} FROM sidecar_templates WHERE id = $1");
        sqlx::query_as::<_, SidecarTemplate>(&query)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// List all sidecar templates ordered by name.
    pub async fn list_templates(pool: &PgPool) -> Result<Vec<SidecarTemplate>, sqlx::Error> {
        let query = format!("SELECT {TEMPLATE_COLUMNS} FROM sidecar_templates ORDER BY name");
        sqlx::query_as::<_, SidecarTemplate>(&query)
            .fetch_all(pool)
            .await
    }

    /// List only built-in sidecar templates.
    pub async fn list_builtin_templates(
        pool: &PgPool,
    ) -> Result<Vec<SidecarTemplate>, sqlx::Error> {
        let query = format!(
            "SELECT {TEMPLATE_COLUMNS} FROM sidecar_templates \
             WHERE is_builtin = true ORDER BY name"
        );
        sqlx::query_as::<_, SidecarTemplate>(&query)
            .fetch_all(pool)
            .await
    }

    /// Update a sidecar template by ID, returning the updated row.
    pub async fn update_template(
        pool: &PgPool,
        id: DbId,
        input: &UpdateSidecarTemplate,
    ) -> Result<Option<SidecarTemplate>, sqlx::Error> {
        let query = format!(
            "UPDATE sidecar_templates SET \
                name = COALESCE($2, name), \
                description = COALESCE($3, description), \
                format = COALESCE($4, format), \
                target_tool = COALESCE($5, target_tool), \
                template_json = COALESCE($6, template_json) \
             WHERE id = $1 \
             RETURNING {TEMPLATE_COLUMNS}"
        );
        sqlx::query_as::<_, SidecarTemplate>(&query)
            .bind(id)
            .bind(&input.name)
            .bind(&input.description)
            .bind(&input.format)
            .bind(&input.target_tool)
            .bind(&input.template_json)
            .fetch_optional(pool)
            .await
    }

    /// Delete a sidecar template by ID. Returns `true` if a row was deleted.
    ///
    /// Built-in templates are **not** deleted by this method; use
    /// [`SidecarRepo::get_template`] to check the `is_builtin` flag before
    /// calling this function, and reject the request at the handler level.
    pub async fn delete_template(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error> {
        let result = sqlx::query("DELETE FROM sidecar_templates WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected() > 0)
    }

    // -----------------------------------------------------------------------
    // Dataset exports
    // -----------------------------------------------------------------------

    /// Create a new dataset export with pending status, returning the created row.
    pub async fn create_export(
        pool: &PgPool,
        project_id: DbId,
        user_id: DbId,
        input: &CreateDatasetExport,
    ) -> Result<DatasetExport, sqlx::Error> {
        let query = format!(
            "INSERT INTO dataset_exports \
                (project_id, name, config_json, status_id, exported_by) \
             VALUES ($1, $2, $3, $4, $5) \
             RETURNING {EXPORT_COLUMNS}"
        );
        sqlx::query_as::<_, DatasetExport>(&query)
            .bind(project_id)
            .bind(&input.name)
            .bind(&input.config_json)
            .bind(JOB_STATUS_ID_PENDING)
            .bind(user_id)
            .fetch_one(pool)
            .await
    }

    /// Find a dataset export by its ID.
    pub async fn get_export(pool: &PgPool, id: DbId) -> Result<Option<DatasetExport>, sqlx::Error> {
        let query = format!("SELECT {EXPORT_COLUMNS} FROM dataset_exports WHERE id = $1");
        sqlx::query_as::<_, DatasetExport>(&query)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// List dataset exports for a project with pagination, newest first.
    pub async fn list_exports_by_project(
        pool: &PgPool,
        project_id: DbId,
        limit: Option<i64>,
        offset: Option<i64>,
    ) -> Result<Vec<DatasetExport>, sqlx::Error> {
        let limit = clamp_limit(limit, DEFAULT_SEARCH_LIMIT, MAX_SEARCH_LIMIT);
        let offset = clamp_offset(offset);
        let query = format!(
            "SELECT {EXPORT_COLUMNS} FROM dataset_exports \
             WHERE project_id = $1 \
             ORDER BY created_at DESC \
             LIMIT $2 OFFSET $3"
        );
        sqlx::query_as::<_, DatasetExport>(&query)
            .bind(project_id)
            .bind(limit)
            .bind(offset)
            .fetch_all(pool)
            .await
    }

    /// Update a dataset export's status, returning the updated row.
    pub async fn update_export_status(
        pool: &PgPool,
        id: DbId,
        status_id: DbId,
    ) -> Result<Option<DatasetExport>, sqlx::Error> {
        let query = format!(
            "UPDATE dataset_exports SET status_id = $2 \
             WHERE id = $1 RETURNING {EXPORT_COLUMNS}"
        );
        sqlx::query_as::<_, DatasetExport>(&query)
            .bind(id)
            .bind(status_id)
            .fetch_optional(pool)
            .await
    }

    /// Update a dataset export's manifest, file path, file size, and sample count.
    pub async fn update_export_data(
        pool: &PgPool,
        id: DbId,
        manifest_json: &serde_json::Value,
        file_path: Option<&str>,
        file_size_bytes: Option<i64>,
        sample_count: Option<i32>,
    ) -> Result<Option<DatasetExport>, sqlx::Error> {
        let query = format!(
            "UPDATE dataset_exports SET \
                manifest_json = $2, \
                file_path = COALESCE($3, file_path), \
                file_size_bytes = COALESCE($4, file_size_bytes), \
                sample_count = COALESCE($5, sample_count) \
             WHERE id = $1 RETURNING {EXPORT_COLUMNS}"
        );
        sqlx::query_as::<_, DatasetExport>(&query)
            .bind(id)
            .bind(manifest_json)
            .bind(file_path)
            .bind(file_size_bytes)
            .bind(sample_count)
            .fetch_optional(pool)
            .await
    }
}
