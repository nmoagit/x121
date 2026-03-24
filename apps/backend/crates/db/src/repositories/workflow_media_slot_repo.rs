//! Repository for the `workflow_media_slots` table (PRD-146).

use sqlx::PgPool;
use x121_core::types::DbId;

use crate::models::workflow_media_slot::{
    CreateWorkflowMediaSlot, UpdateWorkflowMediaSlot, WorkflowMediaSlot,
};

/// Column list for the `workflow_media_slots` table.
const COLUMNS: &str = "id, workflow_id, node_id, input_name, class_type, slot_label, \
    media_type, is_required, fallback_mode, fallback_value, sort_order, description, \
    seed_slot_name, created_at, updated_at";

/// Provides CRUD operations for workflow media slots.
pub struct WorkflowMediaSlotRepo;

impl WorkflowMediaSlotRepo {
    /// Insert a new workflow media slot, returning the created row.
    pub async fn create(
        pool: &PgPool,
        input: &CreateWorkflowMediaSlot,
    ) -> Result<WorkflowMediaSlot, sqlx::Error> {
        let query = format!(
            "INSERT INTO workflow_media_slots
                (workflow_id, node_id, input_name, class_type, slot_label, media_type,
                 is_required, fallback_mode, fallback_value, sort_order, description,
                 seed_slot_name)
             VALUES ($1, $2, $3, COALESCE($4, 'LoadImage'), $5, COALESCE($6, 'image'),
                     COALESCE($7, true), $8, $9, COALESCE($10, 0), $11, $12)
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, WorkflowMediaSlot>(&query)
            .bind(input.workflow_id)
            .bind(&input.node_id)
            .bind(&input.input_name)
            .bind(&input.class_type)
            .bind(&input.slot_label)
            .bind(&input.media_type)
            .bind(input.is_required)
            .bind(&input.fallback_mode)
            .bind(&input.fallback_value)
            .bind(input.sort_order)
            .bind(&input.description)
            .bind(&input.seed_slot_name)
            .fetch_one(pool)
            .await
    }

    /// Find a workflow media slot by its internal ID.
    pub async fn find_by_id(
        pool: &PgPool,
        id: DbId,
    ) -> Result<Option<WorkflowMediaSlot>, sqlx::Error> {
        let query = format!("SELECT {COLUMNS} FROM workflow_media_slots WHERE id = $1");
        sqlx::query_as::<_, WorkflowMediaSlot>(&query)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// List all media slots for a workflow, ordered by `sort_order`.
    pub async fn list_by_workflow(
        pool: &PgPool,
        workflow_id: DbId,
    ) -> Result<Vec<WorkflowMediaSlot>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM workflow_media_slots \
             WHERE workflow_id = $1 ORDER BY sort_order, id"
        );
        sqlx::query_as::<_, WorkflowMediaSlot>(&query)
            .bind(workflow_id)
            .fetch_all(pool)
            .await
    }

    /// Update a workflow media slot. Only non-`None` fields are applied.
    ///
    /// Returns `None` if no row with the given `id` exists.
    pub async fn update(
        pool: &PgPool,
        id: DbId,
        input: &UpdateWorkflowMediaSlot,
    ) -> Result<Option<WorkflowMediaSlot>, sqlx::Error> {
        let query = format!(
            "UPDATE workflow_media_slots SET
                slot_label = COALESCE($2, slot_label),
                media_type = COALESCE($3, media_type),
                is_required = COALESCE($4, is_required),
                fallback_mode = COALESCE($5, fallback_mode),
                fallback_value = COALESCE($6, fallback_value),
                sort_order = COALESCE($7, sort_order),
                description = COALESCE($8, description),
                seed_slot_name = COALESCE($9, seed_slot_name)
             WHERE id = $1
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, WorkflowMediaSlot>(&query)
            .bind(id)
            .bind(&input.slot_label)
            .bind(&input.media_type)
            .bind(input.is_required)
            .bind(&input.fallback_mode)
            .bind(&input.fallback_value)
            .bind(input.sort_order)
            .bind(&input.description)
            .bind(&input.seed_slot_name)
            .fetch_optional(pool)
            .await
    }

    /// Delete a workflow media slot by ID. Returns `true` if a row was removed.
    pub async fn delete(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error> {
        let result = sqlx::query("DELETE FROM workflow_media_slots WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected() > 0)
    }

    /// Bulk-create multiple media slots for a workflow (e.g. during workflow import).
    ///
    /// Returns all created rows in insertion order.
    pub async fn bulk_create(
        pool: &PgPool,
        inputs: &[CreateWorkflowMediaSlot],
    ) -> Result<Vec<WorkflowMediaSlot>, sqlx::Error> {
        let mut results = Vec::with_capacity(inputs.len());
        for input in inputs {
            let slot = Self::create(pool, input).await?;
            results.push(slot);
        }
        Ok(results)
    }
}
