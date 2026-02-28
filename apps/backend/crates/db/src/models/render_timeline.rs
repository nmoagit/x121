//! Timeline view models for the render queue Gantt view (PRD-90).
//!
//! These are read-only projection structs — they map to JOIN queries
//! across `jobs` and `workers`, not to a dedicated table.

use serde::Serialize;
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};

use crate::models::status::StatusId;

/// A job row projected for the timeline view.
///
/// Includes worker name and project name via JOINs for display in the Gantt.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct TimelineJobRow {
    pub id: DbId,
    pub worker_id: Option<DbId>,
    pub worker_name: Option<String>,
    pub status_id: StatusId,
    pub priority: i32,
    pub submitted_at: Timestamp,
    pub started_at: Option<Timestamp>,
    pub completed_at: Option<Timestamp>,
    pub estimated_duration_secs: Option<i32>,
    pub actual_duration_secs: Option<i32>,
    pub job_type: String,
    pub progress_percent: i16,
}

/// A worker row projected for the timeline lane header.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct WorkerLaneRow {
    pub id: DbId,
    pub name: String,
    pub status_id: StatusId,
    pub current_job_id: Option<DbId>,
}
