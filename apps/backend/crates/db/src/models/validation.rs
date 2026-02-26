//! Models for the validation engine and import reporting.

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};

// ── Validation Rule Types ────────────────────────────────────────────

/// A row from the `validation_rule_types` lookup table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct ValidationRuleType {
    pub id: DbId,
    pub name: String,
    pub description: Option<String>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

// ── Validation Rules ─────────────────────────────────────────────────

/// A row from the `validation_rules` table, joined with rule type name.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct ValidationRuleRow {
    pub id: DbId,
    pub entity_type: String,
    pub field_name: String,
    /// Populated from `validation_rule_types.name` via JOIN.
    pub rule_type: String,
    pub config: serde_json::Value,
    pub error_message: String,
    pub severity: String,
    pub is_active: bool,
    pub project_id: Option<DbId>,
    pub sort_order: i32,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// DTO for creating a validation rule.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateValidationRule {
    pub entity_type: String,
    pub field_name: String,
    pub rule_type_id: DbId,
    pub config: Option<serde_json::Value>,
    pub error_message: String,
    pub severity: Option<String>,
    pub is_active: Option<bool>,
    pub project_id: Option<DbId>,
    pub sort_order: Option<i32>,
}

/// DTO for updating a validation rule. All fields are optional.
#[derive(Debug, Clone, Deserialize)]
pub struct UpdateValidationRule {
    pub config: Option<serde_json::Value>,
    pub error_message: Option<String>,
    pub severity: Option<String>,
    pub is_active: Option<bool>,
    pub sort_order: Option<i32>,
}

// ── Import Reports ───────────────────────────────────────────────────

/// A row from the `import_report_statuses` lookup table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct ImportReportStatus {
    pub id: DbId,
    pub name: String,
    pub description: Option<String>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// A row from the `import_reports` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct ImportReport {
    pub id: DbId,
    pub status_id: DbId,
    pub source_type: String,
    pub source_reference: Option<String>,
    pub entity_type: String,
    pub project_id: Option<DbId>,
    pub total_records: i32,
    pub accepted: i32,
    pub rejected: i32,
    pub auto_corrected: i32,
    pub skipped: i32,
    pub report_data: serde_json::Value,
    pub created_by: Option<DbId>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// DTO for creating an import report.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateImportReport {
    /// Looked up by name from `import_report_statuses`.
    pub status: String,
    pub source_type: String,
    pub source_reference: Option<String>,
    pub entity_type: String,
    pub project_id: Option<DbId>,
    pub total_records: i32,
    pub accepted: i32,
    pub rejected: i32,
    pub auto_corrected: i32,
    pub skipped: i32,
    pub report_data: serde_json::Value,
    pub created_by: Option<DbId>,
}

/// A row from the `import_report_entries` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct ImportReportEntry {
    pub id: DbId,
    pub report_id: DbId,
    pub record_index: i32,
    pub entity_id: Option<DbId>,
    pub action: String,
    pub field_errors: serde_json::Value,
    pub field_warnings: serde_json::Value,
    pub field_diffs: serde_json::Value,
    pub conflict_resolutions: serde_json::Value,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// DTO for creating an import report entry.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateImportReportEntry {
    pub report_id: DbId,
    pub record_index: i32,
    pub entity_id: Option<DbId>,
    pub action: String,
    pub field_errors: serde_json::Value,
    pub field_warnings: serde_json::Value,
    pub field_diffs: serde_json::Value,
    pub conflict_resolutions: serde_json::Value,
}
