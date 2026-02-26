//! Delivery export models and DTOs (PRD-39).

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};

use crate::models::status::StatusId;

/// A row from the `delivery_exports` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct DeliveryExport {
    pub id: DbId,
    pub project_id: DbId,
    pub format_profile_id: DbId,
    pub status_id: StatusId,
    pub exported_by: DbId,
    pub include_watermark: bool,
    pub characters_json: Option<serde_json::Value>,
    pub file_path: Option<String>,
    pub file_size_bytes: Option<i64>,
    pub validation_results_json: Option<serde_json::Value>,
    pub error_message: Option<String>,
    pub started_at: Option<Timestamp>,
    pub completed_at: Option<Timestamp>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// DTO for creating a new delivery export record.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateDeliveryExport {
    pub project_id: DbId,
    pub format_profile_id: DbId,
    pub exported_by: DbId,
    pub include_watermark: bool,
    pub characters_json: Option<serde_json::Value>,
}

/// Request body for starting a new assembly/export job.
#[derive(Debug, Clone, Deserialize)]
pub struct StartAssemblyRequest {
    pub format_profile_id: DbId,
    pub character_ids: Option<Vec<DbId>>,
    pub include_watermark: bool,
}

/// Response when an assembly job is started.
#[derive(Debug, Clone, Serialize)]
pub struct AssemblyStartedResponse {
    pub export_id: DbId,
    pub status: String,
}

/// Response for a delivery validation check.
#[derive(Debug, Clone, Serialize)]
pub struct DeliveryValidationResponse {
    pub passed: bool,
    pub error_count: usize,
    pub warning_count: usize,
    pub issues: Vec<ValidationIssueDto>,
}

/// A single validation issue in the response.
#[derive(Debug, Clone, Serialize)]
pub struct ValidationIssueDto {
    pub severity: String,
    pub category: String,
    pub message: String,
    pub entity_id: Option<DbId>,
}
