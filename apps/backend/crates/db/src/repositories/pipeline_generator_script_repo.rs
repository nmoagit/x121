//! Repository for the `pipeline_generator_scripts` table (PRD-143).
//!
//! CRUD operations for pipeline-scoped generator scripts with versioning.

use sqlx::PgPool;
use uuid::Uuid;
use x121_core::types::DbId;

use crate::models::pipeline_generator_script::{
    CreatePipelineGeneratorScript, PipelineGeneratorScript, UpdatePipelineGeneratorScript,
};

/// Column list shared across queries.
const COLUMNS: &str = "id, uuid, pipeline_id, name, description, script_type, \
                        script_content, version, is_active, created_at, updated_at";

/// Provides CRUD operations for pipeline generator scripts.
pub struct PipelineGeneratorScriptRepo;

impl PipelineGeneratorScriptRepo {
    /// Create a new generator script.
    pub async fn create(
        pool: &PgPool,
        input: &CreatePipelineGeneratorScript,
    ) -> Result<PipelineGeneratorScript, sqlx::Error> {
        let query = format!(
            "INSERT INTO pipeline_generator_scripts \
                 (pipeline_id, name, description, script_type, script_content) \
             VALUES ($1, $2, $3, $4, $5) \
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, PipelineGeneratorScript>(&query)
            .bind(input.pipeline_id)
            .bind(&input.name)
            .bind(&input.description)
            .bind(&input.script_type)
            .bind(&input.script_content)
            .fetch_one(pool)
            .await
    }

    /// Find a script by its internal ID.
    pub async fn find_by_id(
        pool: &PgPool,
        id: DbId,
    ) -> Result<Option<PipelineGeneratorScript>, sqlx::Error> {
        let query = format!("SELECT {COLUMNS} FROM pipeline_generator_scripts WHERE id = $1");
        sqlx::query_as::<_, PipelineGeneratorScript>(&query)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// Find a script by UUID.
    pub async fn find_by_uuid(
        pool: &PgPool,
        uuid: Uuid,
    ) -> Result<Option<PipelineGeneratorScript>, sqlx::Error> {
        let query = format!("SELECT {COLUMNS} FROM pipeline_generator_scripts WHERE uuid = $1");
        sqlx::query_as::<_, PipelineGeneratorScript>(&query)
            .bind(uuid)
            .fetch_optional(pool)
            .await
    }

    /// List scripts, optionally filtered by pipeline.
    pub async fn list(
        pool: &PgPool,
        pipeline_id: Option<DbId>,
    ) -> Result<Vec<PipelineGeneratorScript>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM pipeline_generator_scripts \
             WHERE ($1::BIGINT IS NULL OR pipeline_id = $1) \
             ORDER BY pipeline_id, name, version DESC"
        );
        sqlx::query_as::<_, PipelineGeneratorScript>(&query)
            .bind(pipeline_id)
            .fetch_all(pool)
            .await
    }

    /// Update a script. Creates a new version by incrementing the version
    /// number, deactivating the old version, and inserting a new row.
    pub async fn update(
        pool: &PgPool,
        id: DbId,
        input: &UpdatePipelineGeneratorScript,
    ) -> Result<Option<PipelineGeneratorScript>, sqlx::Error> {
        // Find the existing script.
        let Some(existing) = Self::find_by_id(pool, id).await? else {
            return Ok(None);
        };

        let new_name = input.name.as_deref().unwrap_or(&existing.name);
        let new_description = input
            .description
            .as_deref()
            .or(existing.description.as_deref());
        let new_content = input
            .script_content
            .as_deref()
            .unwrap_or(&existing.script_content);
        let new_version = existing.version + 1;

        let mut tx = pool.begin().await?;

        // Deactivate the old version.
        sqlx::query("UPDATE pipeline_generator_scripts SET is_active = false WHERE id = $1")
            .bind(id)
            .execute(&mut *tx)
            .await?;

        // Insert the new version.
        let query = format!(
            "INSERT INTO pipeline_generator_scripts \
                 (pipeline_id, name, description, script_type, script_content, version, is_active) \
             VALUES ($1, $2, $3, $4, $5, $6, true) \
             RETURNING {COLUMNS}"
        );
        let new_script = sqlx::query_as::<_, PipelineGeneratorScript>(&query)
            .bind(existing.pipeline_id)
            .bind(new_name)
            .bind(new_description)
            .bind(&existing.script_type)
            .bind(new_content)
            .bind(new_version)
            .fetch_one(&mut *tx)
            .await?;

        tx.commit().await?;
        Ok(Some(new_script))
    }

    /// Soft-delete a script by deactivating it.
    pub async fn deactivate(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error> {
        let result =
            sqlx::query("UPDATE pipeline_generator_scripts SET is_active = false WHERE id = $1")
                .bind(id)
                .execute(pool)
                .await?;
        Ok(result.rows_affected() > 0)
    }

    /// Find the active script for a pipeline by name.
    pub async fn find_active_for_pipeline(
        pool: &PgPool,
        pipeline_id: DbId,
        name: &str,
    ) -> Result<Option<PipelineGeneratorScript>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM pipeline_generator_scripts \
             WHERE pipeline_id = $1 AND LOWER(name) = LOWER($2) AND is_active = true"
        );
        sqlx::query_as::<_, PipelineGeneratorScript>(&query)
            .bind(pipeline_id)
            .bind(name)
            .fetch_optional(pool)
            .await
    }
}
