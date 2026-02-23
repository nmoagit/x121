//! Repository for the `bulk_operations` table (PRD-18).

use sqlx::PgPool;
use trulience_core::types::{DbId, Timestamp};

use crate::models::bulk_operation::{BulkOperation, CreateBulkOperation};
use crate::models::status::StatusId;

/// Column list shared across queries to avoid repetition.
const COLUMNS: &str = "id, operation_type_id, status_id, parameters, scope_project_id, \
    affected_entity_type, affected_field, preview_count, affected_count, \
    undo_data, error_message, executed_by, executed_at, undone_at, \
    created_at, updated_at";

/// Provides CRUD operations for bulk operations.
pub struct BulkOperationRepo;

impl BulkOperationRepo {
    /// Insert a new bulk operation record, returning the created row.
    pub async fn create(
        pool: &PgPool,
        body: &CreateBulkOperation,
    ) -> Result<BulkOperation, sqlx::Error> {
        let query = format!(
            "INSERT INTO bulk_operations \
                (operation_type_id, status_id, parameters, scope_project_id, \
                 affected_entity_type, affected_field, preview_count) \
             VALUES ($1, $2, $3, $4, $5, $6, $7) \
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, BulkOperation>(&query)
            .bind(body.operation_type_id)
            .bind(body.status_id)
            .bind(&body.parameters)
            .bind(body.scope_project_id)
            .bind(&body.affected_entity_type)
            .bind(&body.affected_field)
            .bind(body.preview_count)
            .fetch_one(pool)
            .await
    }

    /// Find a single bulk operation by ID.
    pub async fn find_by_id(
        pool: &PgPool,
        id: DbId,
    ) -> Result<Option<BulkOperation>, sqlx::Error> {
        let query = format!("SELECT {COLUMNS} FROM bulk_operations WHERE id = $1");
        sqlx::query_as::<_, BulkOperation>(&query)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// Update the status of an operation.
    pub async fn update_status(
        pool: &PgPool,
        id: DbId,
        status_id: StatusId,
    ) -> Result<BulkOperation, sqlx::Error> {
        let query = format!(
            "UPDATE bulk_operations SET status_id = $2 WHERE id = $1 RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, BulkOperation>(&query)
            .bind(id)
            .bind(status_id)
            .fetch_one(pool)
            .await
    }

    /// Update execution results (status, affected count, undo data, executed_by/at).
    pub async fn update_execution(
        pool: &PgPool,
        id: DbId,
        status_id: StatusId,
        affected_count: i32,
        undo_data: &serde_json::Value,
        executed_by: Option<DbId>,
        executed_at: Option<Timestamp>,
    ) -> Result<BulkOperation, sqlx::Error> {
        let query = format!(
            "UPDATE bulk_operations \
             SET status_id = $2, affected_count = $3, undo_data = $4, \
                 executed_by = $5, executed_at = $6 \
             WHERE id = $1 \
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, BulkOperation>(&query)
            .bind(id)
            .bind(status_id)
            .bind(affected_count)
            .bind(undo_data)
            .bind(executed_by)
            .bind(executed_at)
            .fetch_one(pool)
            .await
    }

    /// Update undo results (status to undone, set undone_at).
    pub async fn update_undo(
        pool: &PgPool,
        id: DbId,
        status_id: StatusId,
        undone_at: Option<Timestamp>,
    ) -> Result<BulkOperation, sqlx::Error> {
        let query = format!(
            "UPDATE bulk_operations SET status_id = $2, undone_at = $3 \
             WHERE id = $1 RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, BulkOperation>(&query)
            .bind(id)
            .bind(status_id)
            .bind(undone_at)
            .fetch_one(pool)
            .await
    }

    /// Update error message and status for a failed operation.
    pub async fn update_error(
        pool: &PgPool,
        id: DbId,
        status_id: StatusId,
        error_message: &str,
    ) -> Result<BulkOperation, sqlx::Error> {
        let query = format!(
            "UPDATE bulk_operations SET status_id = $2, error_message = $3 \
             WHERE id = $1 RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, BulkOperation>(&query)
            .bind(id)
            .bind(status_id)
            .bind(error_message)
            .fetch_one(pool)
            .await
    }

    /// List all bulk operations, ordered newest first.
    pub async fn list_all(
        pool: &PgPool,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<BulkOperation>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM bulk_operations \
             ORDER BY created_at DESC \
             LIMIT $1 OFFSET $2"
        );
        sqlx::query_as::<_, BulkOperation>(&query)
            .bind(limit)
            .bind(offset)
            .fetch_all(pool)
            .await
    }

    /// List bulk operations filtered by operation type ID.
    pub async fn list_by_type(
        pool: &PgPool,
        operation_type_id: StatusId,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<BulkOperation>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM bulk_operations \
             WHERE operation_type_id = $1 \
             ORDER BY created_at DESC \
             LIMIT $2 OFFSET $3"
        );
        sqlx::query_as::<_, BulkOperation>(&query)
            .bind(operation_type_id)
            .bind(limit)
            .bind(offset)
            .fetch_all(pool)
            .await
    }

    /// List bulk operations filtered by status ID.
    pub async fn list_by_status(
        pool: &PgPool,
        status_id: StatusId,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<BulkOperation>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM bulk_operations \
             WHERE status_id = $1 \
             ORDER BY created_at DESC \
             LIMIT $2 OFFSET $3"
        );
        sqlx::query_as::<_, BulkOperation>(&query)
            .bind(status_id)
            .bind(limit)
            .bind(offset)
            .fetch_all(pool)
            .await
    }

    /// Count operations by status.
    pub async fn count_by_status(
        pool: &PgPool,
        status_id: StatusId,
    ) -> Result<i64, sqlx::Error> {
        sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM bulk_operations WHERE status_id = $1",
        )
        .bind(status_id)
        .fetch_one(pool)
        .await
    }
}
