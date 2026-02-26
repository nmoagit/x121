//! Job entity models and DTOs for the parallel task execution engine (PRD-07)
//! with scheduling extensions (PRD-08) and failure diagnostics (PRD-28).

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};

use super::status::StatusId;

/// A row from the `jobs` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct Job {
    pub id: DbId,
    pub job_type: String,
    pub status_id: StatusId,
    pub submitted_by: DbId,
    pub worker_id: Option<DbId>,
    pub priority: i32,
    pub parameters: serde_json::Value,
    pub result: Option<serde_json::Value>,
    pub error_message: Option<String>,
    pub error_details: Option<serde_json::Value>,
    pub progress_percent: i16,
    pub progress_message: Option<String>,
    pub submitted_at: Timestamp,
    pub claimed_at: Option<Timestamp>,
    pub started_at: Option<Timestamp>,
    pub completed_at: Option<Timestamp>,
    pub estimated_duration_secs: Option<i32>,
    pub actual_duration_secs: Option<i32>,
    pub retry_of_job_id: Option<DbId>,
    // PRD-08 scheduling columns.
    pub scheduled_start_at: Option<Timestamp>,
    pub is_off_peak_only: bool,
    pub is_paused: bool,
    pub paused_at: Option<Timestamp>,
    pub resumed_at: Option<Timestamp>,
    pub queue_position: Option<i32>,
    // PRD-28 failure diagnostics & checkpoint columns.
    pub failure_stage_index: Option<i32>,
    pub failure_stage_name: Option<String>,
    pub failure_diagnostics: Option<serde_json::Value>,
    pub last_checkpoint_id: Option<DbId>,
    pub resumed_from_checkpoint_id: Option<DbId>,
    pub original_job_id: Option<DbId>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// DTO for submitting a new job via `POST /api/v1/jobs`.
#[derive(Debug, Deserialize)]
pub struct SubmitJob {
    pub job_type: String,
    pub parameters: serde_json::Value,
    pub priority: Option<i32>,
    pub estimated_duration_secs: Option<i32>,
    /// Optional: defer execution until this time (sets status to Scheduled).
    pub scheduled_start_at: Option<chrono::DateTime<chrono::Utc>>,
    /// If true, job only runs during off-peak hours.
    #[serde(default)]
    pub is_off_peak_only: bool,
}

/// Query parameters for `GET /api/v1/jobs`.
#[derive(Debug, Deserialize)]
pub struct JobListQuery {
    /// Filter by status ID (e.g. 1 = pending, 4 = failed).
    pub status_id: Option<StatusId>,
    /// Maximum number of results. Defaults to 50, capped at 100.
    pub limit: Option<i64>,
    /// Number of results to skip. Defaults to 0.
    pub offset: Option<i64>,
}

/// Lightweight view for queue display — avoids sending full job payload.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct QueuedJobView {
    pub id: DbId,
    pub job_type: String,
    pub priority: i32,
    pub submitted_by: DbId,
    pub submitted_at: Timestamp,
    pub queue_position: Option<i32>,
    pub scheduled_start_at: Option<Timestamp>,
    pub is_off_peak_only: bool,
    pub is_paused: bool,
}
