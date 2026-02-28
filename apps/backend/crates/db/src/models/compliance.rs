//! Compliance rule and check models (PRD-102).

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};

/// A row from the `compliance_rules` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct ComplianceRule {
    pub id: DbId,
    pub name: String,
    pub description: Option<String>,
    pub rule_type: String,
    pub config_json: serde_json::Value,
    pub is_global: bool,
    pub project_id: Option<DbId>,
    pub created_by: Option<DbId>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// DTO for creating a new compliance rule.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateComplianceRule {
    pub name: String,
    pub description: Option<String>,
    pub rule_type: String,
    pub config_json: serde_json::Value,
    pub is_global: bool,
    pub project_id: Option<DbId>,
}

/// DTO for updating an existing compliance rule. All fields optional.
#[derive(Debug, Clone, Deserialize)]
pub struct UpdateComplianceRule {
    pub name: Option<String>,
    pub description: Option<String>,
    pub rule_type: Option<String>,
    pub config_json: Option<serde_json::Value>,
    pub is_global: Option<bool>,
    pub project_id: Option<DbId>,
}

/// A row from the `compliance_checks` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct ComplianceCheck {
    pub id: DbId,
    pub scene_id: DbId,
    pub rule_id: DbId,
    pub passed: bool,
    pub actual_value: Option<String>,
    pub expected_value: Option<String>,
    pub message: Option<String>,
    pub checked_at: Timestamp,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// DTO for creating a new compliance check record.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateComplianceCheck {
    pub scene_id: DbId,
    pub rule_id: DbId,
    pub passed: bool,
    pub actual_value: Option<String>,
    pub expected_value: Option<String>,
    pub message: Option<String>,
}

/// Summary of compliance checks for a scene.
#[derive(Debug, Clone, Serialize)]
pub struct ComplianceCheckSummary {
    pub total: i64,
    pub passed: i64,
    pub failed: i64,
}

/// Response DTO for a compliance check run (DRY-499: replaces serde_json::json!).
#[derive(Debug, Clone, Serialize)]
pub struct ComplianceCheckRunResponse {
    pub scene_id: DbId,
    pub checks_run: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}
