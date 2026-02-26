//! Bulk operation models and DTOs (PRD-18).
//!
//! Maps to the `bulk_operations`, `bulk_operation_types`, and
//! `bulk_operation_statuses` tables introduced in migration 000033.

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};

use super::status::StatusId;

// ---------------------------------------------------------------------------
// Lookup entities
// ---------------------------------------------------------------------------

/// A row from the `bulk_operation_types` lookup table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct BulkOperationType {
    pub id: StatusId,
    pub name: String,
    pub label: String,
}

/// A row from the `bulk_operation_statuses` lookup table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct BulkOperationStatus {
    pub id: StatusId,
    pub name: String,
    pub label: String,
}

// ---------------------------------------------------------------------------
// Entity
// ---------------------------------------------------------------------------

/// A row from the `bulk_operations` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct BulkOperation {
    pub id: DbId,
    pub operation_type_id: StatusId,
    pub status_id: StatusId,
    pub parameters: serde_json::Value,
    pub scope_project_id: Option<DbId>,
    pub affected_entity_type: Option<String>,
    pub affected_field: Option<String>,
    pub preview_count: i32,
    pub affected_count: i32,
    pub undo_data: serde_json::Value,
    pub error_message: Option<String>,
    pub executed_by: Option<DbId>,
    pub executed_at: Option<Timestamp>,
    pub undone_at: Option<Timestamp>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

// ---------------------------------------------------------------------------
// Create DTO
// ---------------------------------------------------------------------------

/// DTO for inserting a new bulk operation.
#[derive(Debug, Deserialize)]
pub struct CreateBulkOperation {
    pub operation_type_id: StatusId,
    pub status_id: StatusId,
    pub parameters: serde_json::Value,
    pub scope_project_id: Option<DbId>,
    pub affected_entity_type: Option<String>,
    pub affected_field: Option<String>,
    pub preview_count: i32,
}

// ---------------------------------------------------------------------------
// Update DTO
// ---------------------------------------------------------------------------

/// DTO for updating a bulk operation (all fields optional).
#[derive(Debug, Deserialize)]
pub struct UpdateBulkOperation {
    pub status_id: Option<StatusId>,
    pub affected_count: Option<i32>,
    pub undo_data: Option<serde_json::Value>,
    pub error_message: Option<String>,
    pub executed_by: Option<DbId>,
    pub executed_at: Option<Timestamp>,
    pub undone_at: Option<Timestamp>,
}
