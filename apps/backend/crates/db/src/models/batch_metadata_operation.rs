//! Batch metadata operation models (PRD-088).

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};

/// A row from the `batch_metadata_op_statuses` lookup table.
#[derive(Debug, Clone, Serialize, FromRow)]
pub struct BatchMetadataOpStatus {
    pub id: i16,
    pub name: String,
    pub label: String,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// A row from the `batch_metadata_operations` table.
#[derive(Debug, Clone, Serialize, FromRow)]
pub struct BatchMetadataOperation {
    pub id: DbId,
    pub status_id: i16,
    pub operation_type: String,
    pub project_id: DbId,
    pub character_ids: Vec<DbId>,
    pub character_count: i32,
    pub parameters: serde_json::Value,
    pub before_snapshot: serde_json::Value,
    pub after_snapshot: serde_json::Value,
    pub summary: String,
    pub initiated_by: Option<DbId>,
    pub applied_at: Option<Timestamp>,
    pub undone_at: Option<Timestamp>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// DTO for creating a new batch metadata operation.
#[derive(Debug, Deserialize)]
pub struct CreateBatchMetadataOperation {
    pub status_id: i16,
    pub operation_type: String,
    pub project_id: DbId,
    pub character_ids: Vec<DbId>,
    pub character_count: i32,
    pub parameters: serde_json::Value,
    pub before_snapshot: serde_json::Value,
    pub after_snapshot: serde_json::Value,
    pub summary: String,
    pub initiated_by: Option<DbId>,
    pub applied_at: Option<Timestamp>,
}

/// DTO for updating a batch metadata operation.
#[derive(Debug, Deserialize)]
pub struct UpdateBatchMetadataOperation {
    pub status_id: Option<i16>,
    pub after_snapshot: Option<serde_json::Value>,
    pub summary: Option<String>,
    pub applied_at: Option<Timestamp>,
    pub undone_at: Option<Timestamp>,
}
