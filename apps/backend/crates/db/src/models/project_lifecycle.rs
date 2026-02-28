//! Models and DTOs for project lifecycle management (PRD-72).

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::project_lifecycle::ChecklistResult;
use x121_core::types::{DbId, Timestamp};

/// A row from the `project_summaries` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct ProjectSummary {
    pub id: DbId,
    pub project_id: DbId,
    pub report_json: serde_json::Value,
    pub generated_at: Timestamp,
    pub generated_by: Option<DbId>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// Request body for lifecycle state transitions.
#[derive(Debug, Deserialize)]
pub struct TransitionRequest {
    /// When `true`, skip the completion checklist (admin only).
    pub admin_override: Option<bool>,
}

/// Request body for bulk-archiving projects.
#[derive(Debug, Deserialize)]
pub struct BulkArchiveRequest {
    /// List of project IDs to archive.
    pub project_ids: Vec<DbId>,
}

/// Response body after a successful lifecycle transition.
#[derive(Debug, Serialize)]
pub struct TransitionResponse {
    pub project_id: DbId,
    pub previous_state: String,
    pub new_state: String,
    pub is_edit_locked: bool,
    pub checklist: Option<ChecklistResult>,
    pub summary_generated: bool,
}

/// Response body after a bulk archive operation.
#[derive(Debug, Serialize)]
pub struct BulkArchiveResponse {
    pub archived_count: i64,
    pub failed_ids: Vec<DbId>,
}
