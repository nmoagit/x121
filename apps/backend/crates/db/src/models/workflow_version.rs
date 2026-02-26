//! Workflow version models and DTOs (PRD-75).
//!
//! Defines the database row struct for `workflow_versions` and
//! the create DTO used by the repository layer.

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};

// ---------------------------------------------------------------------------
// Entity
// ---------------------------------------------------------------------------

/// A workflow version row from the `workflow_versions` table.
#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
pub struct WorkflowVersion {
    pub id: DbId,
    pub workflow_id: DbId,
    pub version: i32,
    pub json_content: serde_json::Value,
    pub discovered_params_json: Option<serde_json::Value>,
    pub change_summary: Option<String>,
    pub created_by: Option<DbId>,
    pub created_at: Timestamp,
}

// ---------------------------------------------------------------------------
// Create DTO
// ---------------------------------------------------------------------------

/// Input for creating a new workflow version record.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateWorkflowVersion {
    pub workflow_id: DbId,
    pub json_content: serde_json::Value,
    pub discovered_params_json: Option<serde_json::Value>,
    pub change_summary: Option<String>,
    pub created_by: Option<DbId>,
}

// ---------------------------------------------------------------------------
// Response DTOs
// ---------------------------------------------------------------------------

/// Response for the version diff endpoint (DRY-292).
#[derive(Debug, Serialize)]
pub struct WorkflowDiffResponse {
    pub workflow_id: DbId,
    pub version_a: i32,
    pub version_b: i32,
    pub change_summary_a: Option<String>,
    pub change_summary_b: Option<String>,
    pub keys_changed: Vec<String>,
}
