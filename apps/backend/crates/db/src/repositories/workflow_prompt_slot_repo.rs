//! Repository for the `workflow_prompt_slots` table (PRD-115).

use sqlx::PgPool;
use x121_core::types::DbId;

use crate::models::workflow_prompt_slot::{
    CreateWorkflowPromptSlot, UpdateWorkflowPromptSlot, WorkflowPromptSlot,
};

/// Column list for the `workflow_prompt_slots` table.
const COLUMNS: &str = "id, workflow_id, node_id, input_name, slot_label, slot_type, \
    sort_order, default_text, is_user_editable, description, created_at, updated_at";

/// Provides CRUD operations for workflow prompt slots.
pub struct WorkflowPromptSlotRepo;

impl WorkflowPromptSlotRepo {
    /// Insert a new workflow prompt slot, returning the created row.
    pub async fn create(
        pool: &PgPool,
        input: &CreateWorkflowPromptSlot,
    ) -> Result<WorkflowPromptSlot, sqlx::Error> {
        let query = format!(
            "INSERT INTO workflow_prompt_slots
                (workflow_id, node_id, input_name, slot_label, slot_type,
                 sort_order, default_text, is_user_editable, description)
             VALUES ($1, $2, COALESCE($3, 'text'), $4, COALESCE($5, 'positive'),
                     COALESCE($6, 0), $7, COALESCE($8, true), $9)
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, WorkflowPromptSlot>(&query)
            .bind(input.workflow_id)
            .bind(&input.node_id)
            .bind(&input.input_name)
            .bind(&input.slot_label)
            .bind(&input.slot_type)
            .bind(input.sort_order)
            .bind(&input.default_text)
            .bind(input.is_user_editable)
            .bind(&input.description)
            .fetch_one(pool)
            .await
    }

    /// Find a workflow prompt slot by its internal ID.
    pub async fn find_by_id(
        pool: &PgPool,
        id: DbId,
    ) -> Result<Option<WorkflowPromptSlot>, sqlx::Error> {
        let query = format!("SELECT {COLUMNS} FROM workflow_prompt_slots WHERE id = $1");
        sqlx::query_as::<_, WorkflowPromptSlot>(&query)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// List all prompt slots for a workflow, ordered by `sort_order`.
    pub async fn list_by_workflow(
        pool: &PgPool,
        workflow_id: DbId,
    ) -> Result<Vec<WorkflowPromptSlot>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM workflow_prompt_slots \
             WHERE workflow_id = $1 ORDER BY sort_order, id"
        );
        sqlx::query_as::<_, WorkflowPromptSlot>(&query)
            .bind(workflow_id)
            .fetch_all(pool)
            .await
    }

    /// Update a workflow prompt slot. Only non-`None` fields are applied.
    ///
    /// Returns `None` if no row with the given `id` exists.
    pub async fn update(
        pool: &PgPool,
        id: DbId,
        input: &UpdateWorkflowPromptSlot,
    ) -> Result<Option<WorkflowPromptSlot>, sqlx::Error> {
        let query = format!(
            "UPDATE workflow_prompt_slots SET
                slot_label = COALESCE($2, slot_label),
                slot_type = COALESCE($3, slot_type),
                sort_order = COALESCE($4, sort_order),
                default_text = COALESCE($5, default_text),
                is_user_editable = COALESCE($6, is_user_editable),
                description = COALESCE($7, description)
             WHERE id = $1
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, WorkflowPromptSlot>(&query)
            .bind(id)
            .bind(&input.slot_label)
            .bind(&input.slot_type)
            .bind(input.sort_order)
            .bind(&input.default_text)
            .bind(input.is_user_editable)
            .bind(&input.description)
            .fetch_optional(pool)
            .await
    }

    /// Delete a workflow prompt slot by ID. Returns `true` if a row was removed.
    pub async fn delete(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error> {
        let result = sqlx::query("DELETE FROM workflow_prompt_slots WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected() > 0)
    }

    /// Bulk-create multiple prompt slots for a workflow (e.g. during workflow import).
    ///
    /// Returns all created rows in insertion order.
    pub async fn bulk_create(
        pool: &PgPool,
        inputs: &[CreateWorkflowPromptSlot],
    ) -> Result<Vec<WorkflowPromptSlot>, sqlx::Error> {
        let mut results = Vec::with_capacity(inputs.len());
        for input in inputs {
            let slot = Self::create(pool, input).await?;
            results.push(slot);
        }
        Ok(results)
    }
}
