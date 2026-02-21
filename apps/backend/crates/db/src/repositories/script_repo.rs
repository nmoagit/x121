//! Repository for the `scripts` table (PRD-09).

use sqlx::PgPool;
use trulience_core::types::DbId;

use crate::models::script::{CreateScript, Script, UpdateScript};

/// Column list for `scripts` SELECT queries, including the joined `script_type_name`.
const COLUMNS: &str = "\
    s.id, s.name, s.description, s.script_type_id, \
    st.name AS script_type_name, \
    s.file_path, s.working_directory, \
    s.requirements_path, s.requirements_hash, s.venv_path, \
    s.argument_schema, s.output_schema, \
    s.timeout_secs, s.is_enabled, s.version, s.created_by, \
    s.created_at, s.updated_at";

/// Join clause used in all read queries to include the script type name.
const JOIN: &str = "scripts s JOIN script_types st ON s.script_type_id = st.id";

/// Provides CRUD operations for the scripts registry.
pub struct ScriptRepo;

impl ScriptRepo {
    /// Insert a new script into the registry.
    pub async fn create(pool: &PgPool, dto: &CreateScript) -> Result<Script, sqlx::Error> {
        let query = "\
            INSERT INTO scripts (\
                name, description, script_type_id, file_path, working_directory, \
                requirements_path, requirements_hash, venv_path, \
                argument_schema, output_schema, timeout_secs, version, created_by\
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) \
            RETURNING id";

        let id: DbId = sqlx::query_scalar(query)
            .bind(&dto.name)
            .bind(&dto.description)
            .bind(dto.script_type_id)
            .bind(&dto.file_path)
            .bind(&dto.working_directory)
            .bind(&dto.requirements_path)
            .bind(&dto.requirements_hash)
            .bind(&dto.venv_path)
            .bind(
                dto.argument_schema
                    .as_ref()
                    .unwrap_or(&serde_json::json!({})),
            )
            .bind(dto.output_schema.as_ref().unwrap_or(&serde_json::json!({})))
            .bind(dto.timeout_secs.unwrap_or(300))
            .bind(&dto.version)
            .bind(dto.created_by)
            .fetch_one(pool)
            .await?;

        // Return the full row with the joined script_type_name.
        Self::find_by_id(pool, id)
            .await?
            .ok_or(sqlx::Error::RowNotFound)
    }

    /// Find a script by its ID, including the joined script type name.
    pub async fn find_by_id(pool: &PgPool, id: DbId) -> Result<Option<Script>, sqlx::Error> {
        let query = format!("SELECT {COLUMNS} FROM {JOIN} WHERE s.id = $1");
        sqlx::query_as::<_, Script>(&query)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// List all scripts (enabled and disabled), ordered by name.
    pub async fn list_all(pool: &PgPool) -> Result<Vec<Script>, sqlx::Error> {
        let query = format!("SELECT {COLUMNS} FROM {JOIN} ORDER BY s.name");
        sqlx::query_as::<_, Script>(&query).fetch_all(pool).await
    }

    /// Update a script. Only non-`None` fields in the DTO are applied.
    pub async fn update(
        pool: &PgPool,
        id: DbId,
        dto: &UpdateScript,
    ) -> Result<Option<Script>, sqlx::Error> {
        let query = "\
            UPDATE scripts SET \
                name = COALESCE($2, name), \
                description = COALESCE($3, description), \
                script_type_id = COALESCE($4, script_type_id), \
                file_path = COALESCE($5, file_path), \
                working_directory = COALESCE($6, working_directory), \
                requirements_path = COALESCE($7, requirements_path), \
                requirements_hash = COALESCE($8, requirements_hash), \
                venv_path = COALESCE($9, venv_path), \
                argument_schema = COALESCE($10, argument_schema), \
                output_schema = COALESCE($11, output_schema), \
                timeout_secs = COALESCE($12, timeout_secs), \
                is_enabled = COALESCE($13, is_enabled), \
                version = COALESCE($14, version) \
            WHERE id = $1";

        let rows_affected = sqlx::query(query)
            .bind(id)
            .bind(&dto.name)
            .bind(&dto.description)
            .bind(dto.script_type_id)
            .bind(&dto.file_path)
            .bind(&dto.working_directory)
            .bind(&dto.requirements_path)
            .bind(&dto.requirements_hash)
            .bind(&dto.venv_path)
            .bind(&dto.argument_schema)
            .bind(&dto.output_schema)
            .bind(dto.timeout_secs)
            .bind(dto.is_enabled)
            .bind(&dto.version)
            .execute(pool)
            .await?
            .rows_affected();

        if rows_affected == 0 {
            return Ok(None);
        }

        Self::find_by_id(pool, id).await
    }

    /// Deactivate a script (soft delete: set `is_enabled = false`).
    pub async fn deactivate(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error> {
        let rows = sqlx::query("UPDATE scripts SET is_enabled = false WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?
            .rows_affected();

        Ok(rows > 0)
    }
}
