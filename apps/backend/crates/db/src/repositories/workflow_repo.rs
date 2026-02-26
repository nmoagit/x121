//! Repository for the `workflows` table (PRD-75).

use sqlx::PgPool;
use x121_core::types::DbId;
use x121_core::workflow_import::WORKFLOW_STATUS_ID_DRAFT;

use crate::models::workflow::{CreateWorkflow, UpdateWorkflow, Workflow};

/// Column list for workflows queries.
const COLUMNS: &str = "id, name, description, current_version, status_id, \
    json_content, discovered_params_json, validation_results_json, \
    imported_from, imported_by, created_at, updated_at";

/// Provides CRUD operations for workflows.
pub struct WorkflowRepo;

impl WorkflowRepo {
    /// Insert a new workflow, returning the created row.
    ///
    /// Defaults `status_id` to DRAFT.
    pub async fn create(pool: &PgPool, input: &CreateWorkflow) -> Result<Workflow, sqlx::Error> {
        let query = format!(
            "INSERT INTO workflows
                (name, description, json_content, discovered_params_json,
                 imported_from, imported_by, status_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, Workflow>(&query)
            .bind(&input.name)
            .bind(&input.description)
            .bind(&input.json_content)
            .bind(&input.discovered_params_json)
            .bind(&input.imported_from)
            .bind(input.imported_by)
            .bind(WORKFLOW_STATUS_ID_DRAFT)
            .fetch_one(pool)
            .await
    }

    /// Find a workflow by its primary key.
    pub async fn find_by_id(pool: &PgPool, id: DbId) -> Result<Option<Workflow>, sqlx::Error> {
        let query = format!("SELECT {COLUMNS} FROM workflows WHERE id = $1");
        sqlx::query_as::<_, Workflow>(&query)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// Find a workflow by its unique name.
    pub async fn find_by_name(pool: &PgPool, name: &str) -> Result<Option<Workflow>, sqlx::Error> {
        let query = format!("SELECT {COLUMNS} FROM workflows WHERE name = $1");
        sqlx::query_as::<_, Workflow>(&query)
            .bind(name)
            .fetch_optional(pool)
            .await
    }

    /// List workflows with optional status filter and pagination, ordered by name.
    pub async fn list(
        pool: &PgPool,
        status_id: Option<DbId>,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<Workflow>, sqlx::Error> {
        if let Some(sid) = status_id {
            let query = format!(
                "SELECT {COLUMNS} FROM workflows
                 WHERE status_id = $1
                 ORDER BY name
                 LIMIT $2 OFFSET $3"
            );
            sqlx::query_as::<_, Workflow>(&query)
                .bind(sid)
                .bind(limit)
                .bind(offset)
                .fetch_all(pool)
                .await
        } else {
            let query = format!(
                "SELECT {COLUMNS} FROM workflows
                 ORDER BY name
                 LIMIT $1 OFFSET $2"
            );
            sqlx::query_as::<_, Workflow>(&query)
                .bind(limit)
                .bind(offset)
                .fetch_all(pool)
                .await
        }
    }

    /// Update a workflow with the provided fields, returning the updated row.
    pub async fn update(
        pool: &PgPool,
        id: DbId,
        input: &UpdateWorkflow,
    ) -> Result<Option<Workflow>, sqlx::Error> {
        let query = format!(
            "UPDATE workflows SET
                name = COALESCE($1, name),
                description = COALESCE($2, description),
                json_content = COALESCE($3, json_content),
                status_id = COALESCE($4, status_id)
             WHERE id = $5
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, Workflow>(&query)
            .bind(&input.name)
            .bind(&input.description)
            .bind(&input.json_content)
            .bind(input.status_id)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// Update only the status of a workflow. Returns `true` if a row was updated.
    pub async fn update_status(
        pool: &PgPool,
        id: DbId,
        status_id: DbId,
    ) -> Result<bool, sqlx::Error> {
        let result = sqlx::query("UPDATE workflows SET status_id = $1 WHERE id = $2")
            .bind(status_id)
            .bind(id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected() > 0)
    }

    /// Update the validation results JSON. Returns `true` if a row was updated.
    pub async fn update_validation(
        pool: &PgPool,
        id: DbId,
        results: &serde_json::Value,
    ) -> Result<bool, sqlx::Error> {
        let result = sqlx::query("UPDATE workflows SET validation_results_json = $1 WHERE id = $2")
            .bind(results)
            .bind(id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected() > 0)
    }

    /// Delete a workflow by its ID. Returns `true` if a row was deleted.
    pub async fn delete(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error> {
        let result = sqlx::query("DELETE FROM workflows WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected() > 0)
    }

    /// Count total workflows.
    pub async fn count(pool: &PgPool) -> Result<i64, sqlx::Error> {
        let row: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM workflows")
            .fetch_one(pool)
            .await?;
        Ok(row.0)
    }
}
