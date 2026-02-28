//! Production report models and DTOs (PRD-73).

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};

/// A row from the `report_types` lookup table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct ReportType {
    pub id: DbId,
    pub name: String,
    pub description: Option<String>,
    pub config_schema_json: Option<serde_json::Value>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// A row from the `reports` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct Report {
    pub id: DbId,
    pub report_type_id: DbId,
    pub config_json: serde_json::Value,
    pub data_json: Option<serde_json::Value>,
    pub file_path: Option<String>,
    pub format: String,
    pub generated_by: Option<DbId>,
    pub status_id: DbId,
    pub started_at: Option<Timestamp>,
    pub completed_at: Option<Timestamp>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// DTO for creating a new report (generate request).
#[derive(Debug, Deserialize)]
pub struct CreateReport {
    pub report_type_id: DbId,
    pub config_json: serde_json::Value,
    pub format: String,
}

/// A row from the `report_schedules` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct ReportSchedule {
    pub id: DbId,
    pub report_type_id: DbId,
    pub config_json: serde_json::Value,
    pub format: String,
    pub schedule: String,
    pub recipients_json: serde_json::Value,
    pub enabled: bool,
    pub last_run_at: Option<Timestamp>,
    pub next_run_at: Option<Timestamp>,
    pub created_by: DbId,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// DTO for creating a new report schedule.
#[derive(Debug, Deserialize)]
pub struct CreateReportSchedule {
    pub report_type_id: DbId,
    pub config_json: serde_json::Value,
    pub format: String,
    pub schedule: String,
    pub recipients_json: serde_json::Value,
}

/// DTO for updating an existing report schedule.
#[derive(Debug, Deserialize)]
pub struct UpdateReportSchedule {
    pub config_json: Option<serde_json::Value>,
    pub format: Option<String>,
    pub schedule: Option<String>,
    pub recipients_json: Option<serde_json::Value>,
    pub enabled: Option<bool>,
}
