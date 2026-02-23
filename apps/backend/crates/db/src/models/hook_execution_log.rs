//! Hook execution log models and DTOs (PRD-77).
//!
//! Defines the database row struct for `hook_execution_logs` and the
//! create DTO used when recording an execution result.

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use trulience_core::types::{DbId, Timestamp};

// ---------------------------------------------------------------------------
// Entity
// ---------------------------------------------------------------------------

/// A hook execution log row from the `hook_execution_logs` table.
#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
pub struct HookExecutionLog {
    pub id: DbId,
    pub hook_id: DbId,
    pub job_id: Option<DbId>,
    pub input_json: Option<serde_json::Value>,
    pub output_text: Option<String>,
    pub exit_code: Option<i32>,
    pub duration_ms: Option<i64>,
    pub success: bool,
    pub error_message: Option<String>,
    pub executed_at: Timestamp,
}

// ---------------------------------------------------------------------------
// Create DTO
// ---------------------------------------------------------------------------

/// Input for recording a hook execution log entry.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateHookExecutionLog {
    pub hook_id: DbId,
    pub job_id: Option<DbId>,
    pub input_json: Option<serde_json::Value>,
    pub output_text: Option<String>,
    pub exit_code: Option<i32>,
    pub duration_ms: Option<i64>,
    pub success: bool,
    pub error_message: Option<String>,
}
