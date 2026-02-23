//! Repository for the `project_configs` table (PRD-74).

use sqlx::PgPool;
use trulience_core::search::{clamp_limit, clamp_offset, DEFAULT_SEARCH_LIMIT, MAX_SEARCH_LIMIT};
use trulience_core::types::DbId;

use crate::models::project_config::{
    CreateProjectConfig, ProjectConfig, UpdateProjectConfig,
};

/// Column list for project_configs queries.
const COLUMNS: &str = "id, name, description, version, config_json, source_project_id, \
    is_recommended, created_by_id, created_at, updated_at";

/// Provides CRUD operations for project configuration templates.
pub struct ProjectConfigRepo;

impl ProjectConfigRepo {
    /// Insert a new project config, returning the created row.
    pub async fn create(
        pool: &PgPool,
        input: &CreateProjectConfig,
        user_id: DbId,
    ) -> Result<ProjectConfig, sqlx::Error> {
        let query = format!(
            "INSERT INTO project_configs \
                (name, description, config_json, source_project_id, created_by_id) \
             VALUES ($1, $2, $3, $4, $5) \
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, ProjectConfig>(&query)
            .bind(&input.name)
            .bind(&input.description)
            .bind(&input.config_json)
            .bind(input.source_project_id)
            .bind(user_id)
            .fetch_one(pool)
            .await
    }

    /// Find a project config by its primary key.
    pub async fn find_by_id(
        pool: &PgPool,
        id: DbId,
    ) -> Result<Option<ProjectConfig>, sqlx::Error> {
        let query = format!("SELECT {COLUMNS} FROM project_configs WHERE id = $1");
        sqlx::query_as::<_, ProjectConfig>(&query)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// List project configs with pagination.
    /// Ordered by recommended first, then newest first.
    pub async fn list(
        pool: &PgPool,
        limit: Option<i64>,
        offset: Option<i64>,
    ) -> Result<Vec<ProjectConfig>, sqlx::Error> {
        let limit_val = clamp_limit(limit, DEFAULT_SEARCH_LIMIT, MAX_SEARCH_LIMIT);
        let offset_val = clamp_offset(offset);

        let query = format!(
            "SELECT {COLUMNS} FROM project_configs \
             ORDER BY is_recommended DESC, created_at DESC \
             LIMIT $1 OFFSET $2"
        );
        sqlx::query_as::<_, ProjectConfig>(&query)
            .bind(limit_val)
            .bind(offset_val)
            .fetch_all(pool)
            .await
    }

    /// List only recommended project configs.
    pub async fn list_recommended(pool: &PgPool) -> Result<Vec<ProjectConfig>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM project_configs \
             WHERE is_recommended = true \
             ORDER BY created_at DESC"
        );
        sqlx::query_as::<_, ProjectConfig>(&query)
            .fetch_all(pool)
            .await
    }

    /// Update an existing project config. Returns the updated row, or `None` if not found.
    pub async fn update(
        pool: &PgPool,
        id: DbId,
        input: &UpdateProjectConfig,
    ) -> Result<Option<ProjectConfig>, sqlx::Error> {
        let query = format!(
            "UPDATE project_configs SET \
                name          = COALESCE($1, name), \
                description   = COALESCE($2, description), \
                config_json   = COALESCE($3, config_json), \
                is_recommended = COALESCE($4, is_recommended), \
                version       = version + 1 \
             WHERE id = $5 \
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, ProjectConfig>(&query)
            .bind(&input.name)
            .bind(&input.description)
            .bind(&input.config_json)
            .bind(input.is_recommended)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// Delete a project config by its ID. Returns `true` if a row was deleted.
    pub async fn delete(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error> {
        let result = sqlx::query("DELETE FROM project_configs WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected() > 0)
    }

    /// Export a project's configuration by querying its scene types
    /// and building a JSON snapshot.
    pub async fn export_project_config(
        pool: &PgPool,
        project_id: DbId,
    ) -> Result<serde_json::Value, sqlx::Error> {
        // Query scene types for this project and serialize as JSON array.
        let rows = sqlx::query_as::<_, SceneTypeRow>(
            "SELECT id, name, prompt_template, negative_prompt_template, \
                    workflow_json, lora_config, model_config, generation_params, \
                    target_duration_secs, segment_duration_secs, \
                    duration_tolerance_secs, variant_applicability, \
                    sort_order, description \
             FROM scene_types \
             WHERE project_id = $1 AND deleted_at IS NULL \
             ORDER BY sort_order ASC, name ASC",
        )
        .bind(project_id)
        .fetch_all(pool)
        .await?;

        let scene_types: Vec<serde_json::Value> = rows
            .iter()
            .map(|r| {
                serde_json::json!({
                    "name": r.name,
                    "description": r.description,
                    "prompt_template": r.prompt_template,
                    "negative_prompt_template": r.negative_prompt_template,
                    "workflow_json": r.workflow_json,
                    "lora_config": r.lora_config,
                    "model_config": r.model_config,
                    "generation_params": r.generation_params,
                    "target_duration_secs": r.target_duration_secs,
                    "segment_duration_secs": r.segment_duration_secs,
                    "duration_tolerance_secs": r.duration_tolerance_secs,
                    "variant_applicability": r.variant_applicability,
                    "sort_order": r.sort_order,
                })
            })
            .collect();

        Ok(serde_json::json!({
            "scene_types": scene_types,
            "exported_from_project_id": project_id,
        }))
    }
}

/// Internal helper struct for scene type row fetching during export.
#[derive(Debug, sqlx::FromRow)]
struct SceneTypeRow {
    #[allow(dead_code)]
    id: DbId,
    name: String,
    description: Option<String>,
    prompt_template: Option<String>,
    negative_prompt_template: Option<String>,
    workflow_json: Option<serde_json::Value>,
    lora_config: Option<serde_json::Value>,
    model_config: Option<serde_json::Value>,
    generation_params: Option<serde_json::Value>,
    target_duration_secs: Option<i32>,
    segment_duration_secs: Option<i32>,
    duration_tolerance_secs: i32,
    variant_applicability: String,
    sort_order: i32,
}
