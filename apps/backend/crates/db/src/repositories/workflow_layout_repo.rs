//! Repository for the `workflow_layouts` table (PRD-33).
//!
//! Provides find-by-workflow, upsert, and delete operations for
//! workflow canvas layout persistence.

use sqlx::PgPool;
use x121_core::types::DbId;

use crate::models::workflow_layout::{CreateWorkflowLayout, WorkflowLayout};

/// Column list for `workflow_layouts` queries.
const COLUMNS: &str = "\
    id, workflow_id, canvas_json, node_positions_json, \
    created_at, updated_at";

/// Provides data access for workflow canvas layouts.
pub struct WorkflowLayoutRepo;

impl WorkflowLayoutRepo {
    /// Find the layout for a specific workflow.
    ///
    /// Returns `None` if no layout has been saved for the workflow.
    pub async fn find_by_workflow(
        pool: &PgPool,
        workflow_id: DbId,
    ) -> Result<Option<WorkflowLayout>, sqlx::Error> {
        let query = format!("SELECT {COLUMNS} FROM workflow_layouts WHERE workflow_id = $1");
        sqlx::query_as::<_, WorkflowLayout>(&query)
            .bind(workflow_id)
            .fetch_optional(pool)
            .await
    }

    /// Insert or update the layout for a workflow.
    ///
    /// Uses PostgreSQL `ON CONFLICT ... DO UPDATE` on the unique
    /// `workflow_id` constraint to perform an upsert.
    pub async fn upsert(
        pool: &PgPool,
        workflow_id: DbId,
        dto: &CreateWorkflowLayout,
    ) -> Result<WorkflowLayout, sqlx::Error> {
        let query = format!(
            "INSERT INTO workflow_layouts (workflow_id, canvas_json, node_positions_json) \
             VALUES ($1, $2, $3) \
             ON CONFLICT (workflow_id) DO UPDATE SET \
                 canvas_json         = EXCLUDED.canvas_json, \
                 node_positions_json = EXCLUDED.node_positions_json \
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, WorkflowLayout>(&query)
            .bind(workflow_id)
            .bind(&dto.canvas_json)
            .bind(&dto.node_positions_json)
            .fetch_one(pool)
            .await
    }

    /// Delete the layout for a workflow.
    ///
    /// Returns `true` if a row was deleted.
    pub async fn delete(pool: &PgPool, workflow_id: DbId) -> Result<bool, sqlx::Error> {
        let result = sqlx::query("DELETE FROM workflow_layouts WHERE workflow_id = $1")
            .bind(workflow_id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected() > 0)
    }
}
