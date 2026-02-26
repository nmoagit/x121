//! Repository for the `batch_metadata_operations` table (PRD-088).

use sqlx::PgPool;
use x121_core::types::{DbId, Timestamp};

use crate::models::batch_metadata_operation::{
    BatchMetadataOpStatus, BatchMetadataOperation, CreateBatchMetadataOperation,
};

/// Column list for batch_metadata_operations queries.
const COLUMNS: &str = "\
    id, status_id, operation_type, project_id, character_ids, \
    character_count, parameters, before_snapshot, after_snapshot, \
    summary, initiated_by, applied_at, undone_at, created_at, updated_at";

/// Column list for batch_metadata_op_statuses queries.
const STATUS_COLUMNS: &str = "id, name, label, created_at, updated_at";

/// Provides CRUD operations for batch metadata operations.
pub struct BatchMetadataOperationRepo;

impl BatchMetadataOperationRepo {
    /// Create a new batch metadata operation, returning the created row.
    pub async fn create(
        pool: &PgPool,
        input: &CreateBatchMetadataOperation,
    ) -> Result<BatchMetadataOperation, sqlx::Error> {
        let query = format!(
            "INSERT INTO batch_metadata_operations \
                (status_id, operation_type, project_id, character_ids, \
                 character_count, parameters, before_snapshot, after_snapshot, \
                 summary, initiated_by, applied_at) \
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) \
             RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, BatchMetadataOperation>(&query)
            .bind(input.status_id)
            .bind(&input.operation_type)
            .bind(input.project_id)
            .bind(&input.character_ids)
            .bind(input.character_count)
            .bind(&input.parameters)
            .bind(&input.before_snapshot)
            .bind(&input.after_snapshot)
            .bind(&input.summary)
            .bind(input.initiated_by)
            .bind(input.applied_at)
            .fetch_one(pool)
            .await
    }

    /// Find a batch metadata operation by ID.
    pub async fn find_by_id(
        pool: &PgPool,
        id: DbId,
    ) -> Result<Option<BatchMetadataOperation>, sqlx::Error> {
        let query = format!("SELECT {COLUMNS} FROM batch_metadata_operations WHERE id = $1");
        sqlx::query_as::<_, BatchMetadataOperation>(&query)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// Update the status of a batch operation.
    pub async fn update_status(
        pool: &PgPool,
        id: DbId,
        status_id: i16,
    ) -> Result<Option<BatchMetadataOperation>, sqlx::Error> {
        let query = format!(
            "UPDATE batch_metadata_operations SET status_id = $2 \
             WHERE id = $1 RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, BatchMetadataOperation>(&query)
            .bind(id)
            .bind(status_id)
            .fetch_optional(pool)
            .await
    }

    /// Mark an operation as applied with timestamp and after_snapshot.
    pub async fn update_applied(
        pool: &PgPool,
        id: DbId,
        status_id: i16,
        after_snapshot: &serde_json::Value,
        applied_at: Timestamp,
    ) -> Result<Option<BatchMetadataOperation>, sqlx::Error> {
        let query = format!(
            "UPDATE batch_metadata_operations \
             SET status_id = $2, after_snapshot = $3, applied_at = $4 \
             WHERE id = $1 RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, BatchMetadataOperation>(&query)
            .bind(id)
            .bind(status_id)
            .bind(after_snapshot)
            .bind(applied_at)
            .fetch_optional(pool)
            .await
    }

    /// Mark an operation as undone with timestamp.
    pub async fn update_undone(
        pool: &PgPool,
        id: DbId,
        status_id: i16,
        undone_at: Timestamp,
    ) -> Result<Option<BatchMetadataOperation>, sqlx::Error> {
        let query = format!(
            "UPDATE batch_metadata_operations \
             SET status_id = $2, undone_at = $3 \
             WHERE id = $1 RETURNING {COLUMNS}"
        );
        sqlx::query_as::<_, BatchMetadataOperation>(&query)
            .bind(id)
            .bind(status_id)
            .bind(undone_at)
            .fetch_optional(pool)
            .await
    }

    /// List batch operations for a project, ordered by creation time descending.
    pub async fn list_by_project(
        pool: &PgPool,
        project_id: DbId,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<BatchMetadataOperation>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM batch_metadata_operations \
             WHERE project_id = $1 \
             ORDER BY created_at DESC \
             LIMIT $2 OFFSET $3"
        );
        sqlx::query_as::<_, BatchMetadataOperation>(&query)
            .bind(project_id)
            .bind(limit)
            .bind(offset)
            .fetch_all(pool)
            .await
    }

    /// List the most recent batch operations across all projects.
    pub async fn list_recent(
        pool: &PgPool,
        limit: i64,
    ) -> Result<Vec<BatchMetadataOperation>, sqlx::Error> {
        let query = format!(
            "SELECT {COLUMNS} FROM batch_metadata_operations \
             ORDER BY created_at DESC \
             LIMIT $1"
        );
        sqlx::query_as::<_, BatchMetadataOperation>(&query)
            .bind(limit)
            .fetch_all(pool)
            .await
    }

    /// Count batch operations by status name.
    pub async fn count_by_status(pool: &PgPool, status_name: &str) -> Result<i64, sqlx::Error> {
        let count: (i64,) = sqlx::query_as(
            "SELECT COUNT(*) FROM batch_metadata_operations bmo \
             JOIN batch_metadata_op_statuses bmos ON bmo.status_id = bmos.id \
             WHERE bmos.name = $1",
        )
        .bind(status_name)
        .fetch_one(pool)
        .await?;
        Ok(count.0)
    }

    /// List all statuses from the lookup table.
    pub async fn list_statuses(pool: &PgPool) -> Result<Vec<BatchMetadataOpStatus>, sqlx::Error> {
        let query =
            format!("SELECT {STATUS_COLUMNS} FROM batch_metadata_op_statuses ORDER BY id ASC");
        sqlx::query_as::<_, BatchMetadataOpStatus>(&query)
            .fetch_all(pool)
            .await
    }

    /// Find a status by name.
    pub async fn find_status_by_name(
        pool: &PgPool,
        name: &str,
    ) -> Result<Option<BatchMetadataOpStatus>, sqlx::Error> {
        let query =
            format!("SELECT {STATUS_COLUMNS} FROM batch_metadata_op_statuses WHERE name = $1");
        sqlx::query_as::<_, BatchMetadataOpStatus>(&query)
            .bind(name)
            .fetch_optional(pool)
            .await
    }
}
