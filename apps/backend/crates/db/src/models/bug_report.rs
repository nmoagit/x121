//! Bug report entity model and DTOs (PRD-44).

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use trulience_core::types::{DbId, Timestamp};

/// A row from the `bug_reports` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct BugReport {
    pub id: DbId,
    pub user_id: DbId,
    pub description: Option<String>,
    pub url: Option<String>,
    pub browser_info: Option<String>,
    pub console_errors_json: Option<serde_json::Value>,
    pub action_history_json: Option<serde_json::Value>,
    pub context_json: Option<serde_json::Value>,
    pub recording_path: Option<String>,
    pub screenshot_path: Option<String>,
    pub status: String,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// DTO for creating a new bug report.
#[derive(Debug, Deserialize)]
pub struct CreateBugReport {
    pub description: Option<String>,
    pub url: Option<String>,
    pub browser_info: Option<String>,
    pub console_errors_json: Option<serde_json::Value>,
    pub action_history_json: Option<serde_json::Value>,
    pub context_json: Option<serde_json::Value>,
}

/// DTO for updating a bug report's status.
#[derive(Debug, Deserialize)]
pub struct UpdateBugReportStatus {
    pub status: String,
}

/// Query parameters for listing bug reports.
#[derive(Debug, Deserialize)]
pub struct BugReportListParams {
    pub status: Option<String>,
    pub user_id: Option<DbId>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}
