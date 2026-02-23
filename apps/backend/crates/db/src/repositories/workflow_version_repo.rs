//! Repository for the `workflow_versions` table (PRD-75).

use sqlx::PgPool;
use trulience_core::types::DbId;

use crate::models::workflow_version::{CreateWorkflowVersion, WorkflowVersion};

/// Column list for workflow_versions queries.
const COLUMNS: &str = "id, workflow_id, version, json_content, \
    discovered_params_json, change_summary, created_by, created_at";

/// Provides CRUD operations for workflow versions.
pub struct WorkflowVersionRepo;

impl WorkflowVersionRepo {
    /// Insert a new workflow version, auto-incrementing the version number.
    ///
    /// The version is computed as `MAX(version) + 1` for the given workflow.
    pub async fn create(
        pool: &PgPool,
        input: &CreateWorkflowVersion,
    ) -> Result<WorkflowVersion, sqlx::Error> {
        let query = format!(
            "INSERT INTO workflow_versions
                (workflow_id, version, json_content, discovered_params_json,
                 change_summary, created_by)
             VALUES (
                 $1,
                 COALESCE(
                     (SELECT MAX(version) FROM workflow_versions WHERE workflow_id = $1),
                     0
                 ) + 1,
                 $2, $3, $4, $5
             )
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, WorkflowVersion>(&query)
            .bind(input.workflow_id)
            .bind(&input.json_content)
            .bind(&input.discovered_params_json)
            .bind(&input.change_summary)
            .bind(input.created_by)
            .fetch_one(pool)
            .await
    }

    /// Find a workflow version by its primary key.
    pub async fn find_by_id(
        pool: &PgPool,
        id: DbId,
    ) -> Result<Option<WorkflowVersion>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM workflow_versions WHERE id = $1"
        );
        sqlx::query_as::<_, WorkflowVersion>(&query)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// List versions for a workflow, ordered by version descending (newest first).
    pub async fn list_for_workflow(
        pool: &PgPool,
        workflow_id: DbId,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<WorkflowVersion>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM workflow_versions
             WHERE workflow_id = $1
             ORDER BY version DESC
             LIMIT $2 OFFSET $3"
        );
        sqlx::query_as::<_, WorkflowVersion>(&query)
            .bind(workflow_id)
            .bind(limit)
            .bind(offset)
            .fetch_all(pool)
            .await
    }

    /// Find a specific version by workflow ID and version number.
    pub async fn find_by_version(
        pool: &PgPool,
        workflow_id: DbId,
        version: i32,
    ) -> Result<Option<WorkflowVersion>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM workflow_versions
             WHERE workflow_id = $1 AND version = $2"
        );
        sqlx::query_as::<_, WorkflowVersion>(&query)
            .bind(workflow_id)
            .bind(version)
            .fetch_optional(pool)
            .await
    }

    /// Count versions for a given workflow.
    pub async fn count_for_workflow(
        pool: &PgPool,
        workflow_id: DbId,
    ) -> Result<i64, sqlx::Error> {
        let row: (i64,) = sqlx::query_as(
            "SELECT COUNT(*) FROM workflow_versions WHERE workflow_id = $1",
        )
        .bind(workflow_id)
        .fetch_one(pool)
        .await?;
        Ok(row.0)
    }
}
