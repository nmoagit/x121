//! Export job models and DTOs (PRD-151).

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};

/// A row from the `export_jobs` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct ExportJob {
    pub id: DbId,
    pub entity_type: String,
    pub requested_by: DbId,
    pub pipeline_id: Option<DbId>,
    pub item_count: i32,
    pub split_size_mb: i32,
    pub filter_snapshot: Option<serde_json::Value>,
    pub status: String,
    pub parts: Option<serde_json::Value>,
    pub error_message: Option<String>,
    pub started_at: Option<Timestamp>,
    pub completed_at: Option<Timestamp>,
    pub expires_at: Option<Timestamp>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// DTO for creating a new export job record.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateExportJob {
    pub entity_type: String,
    pub requested_by: DbId,
    pub pipeline_id: Option<DbId>,
    pub item_count: i32,
    pub split_size_mb: i32,
    pub filter_snapshot: Option<serde_json::Value>,
}
