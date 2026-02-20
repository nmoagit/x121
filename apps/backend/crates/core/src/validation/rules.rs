//! Validation rule and result types.

use serde::{Deserialize, Serialize};

use crate::types::DbId;

/// A validation rule loaded from the database.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidationRule {
    pub id: DbId,
    pub entity_type: String,
    pub field_name: String,
    pub rule_type: String,
    pub config: serde_json::Value,
    pub error_message: String,
    pub severity: ValidationSeverity,
}

/// Whether a rule violation blocks the import or is informational.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ValidationSeverity {
    Error,
    Warning,
}

/// Aggregated result of evaluating all rules against one record.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidationResult {
    pub is_valid: bool,
    pub errors: Vec<FieldViolation>,
    pub warnings: Vec<FieldViolation>,
}

/// A single field-level rule violation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FieldViolation {
    pub field: String,
    pub rule_type: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub value: Option<serde_json::Value>,
}
