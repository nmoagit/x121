//! Job debug state models and DTOs for interactive debugger (PRD-34).

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};

/// A row from the `job_debug_state` table.
///
/// Stores mid-run debug state for a paused job: which step it paused at,
/// any modified parameters, intermediate previews, and abort reason.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct JobDebugState {
    pub id: DbId,
    pub job_id: DbId,
    pub paused_at_step: Option<i32>,
    pub modified_params: serde_json::Value,
    pub intermediate_previews: serde_json::Value,
    pub abort_reason: Option<String>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// DTO for creating a new debug state entry.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateJobDebugState {
    pub job_id: DbId,
}

/// DTO for updating debug state fields (all optional).
#[derive(Debug, Clone, Deserialize)]
pub struct UpdateJobDebugState {
    pub paused_at_step: Option<i32>,
    pub modified_params: Option<serde_json::Value>,
    pub abort_reason: Option<String>,
}

/// Request body for pausing a job at a specific step.
#[derive(Debug, Clone, Deserialize)]
pub struct PauseJobRequest {
    /// Optional step number where the pause is requested.
    pub step: Option<i32>,
}

/// Request body for resuming a paused job.
#[derive(Debug, Clone, Deserialize)]
pub struct ResumeJobRequest {}

/// Request body for updating mid-run parameters.
#[derive(Debug, Clone, Deserialize)]
pub struct UpdateParamsRequest {
    pub params: serde_json::Value,
}

/// Request body for aborting a job with an optional reason.
#[derive(Debug, Clone, Deserialize)]
pub struct AbortJobRequest {
    pub reason: Option<String>,
}
