//! Script orchestrator entity models and DTOs (PRD-09).
//!
//! Models for the `scripts`, `script_types`, `script_executions`, and
//! `execution_statuses` tables.

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use trulience_core::types::{DbId, Timestamp};

// ---------------------------------------------------------------------------
// Script types (lookup)
// ---------------------------------------------------------------------------

/// A supported script runtime type (shell, python, binary).
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct ScriptType {
    pub id: i16,
    pub name: String,
    pub label: String,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

// ---------------------------------------------------------------------------
// Scripts
// ---------------------------------------------------------------------------

/// A registered script in the orchestrator registry.
///
/// Includes the joined `script_type_name` from the `script_types` lookup table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct Script {
    pub id: DbId,
    pub name: String,
    pub description: Option<String>,
    pub script_type_id: i16,
    /// Joined from `script_types.name`.
    pub script_type_name: String,
    pub file_path: String,
    pub working_directory: Option<String>,
    pub requirements_path: Option<String>,
    pub requirements_hash: Option<String>,
    pub venv_path: Option<String>,
    pub argument_schema: serde_json::Value,
    pub output_schema: serde_json::Value,
    pub timeout_secs: i32,
    pub is_enabled: bool,
    pub version: Option<String>,
    pub created_by: Option<DbId>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// DTO for inserting a new script into the registry.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateScript {
    pub name: String,
    pub description: Option<String>,
    pub script_type_id: i16,
    pub file_path: String,
    pub working_directory: Option<String>,
    pub requirements_path: Option<String>,
    pub requirements_hash: Option<String>,
    pub venv_path: Option<String>,
    pub argument_schema: Option<serde_json::Value>,
    pub output_schema: Option<serde_json::Value>,
    pub timeout_secs: Option<i32>,
    pub version: Option<String>,
    pub created_by: Option<DbId>,
}

/// DTO for updating an existing script. All fields are optional.
#[derive(Debug, Clone, Deserialize)]
pub struct UpdateScript {
    pub name: Option<String>,
    pub description: Option<String>,
    pub script_type_id: Option<i16>,
    pub file_path: Option<String>,
    pub working_directory: Option<String>,
    pub requirements_path: Option<String>,
    pub requirements_hash: Option<String>,
    pub venv_path: Option<String>,
    pub argument_schema: Option<serde_json::Value>,
    pub output_schema: Option<serde_json::Value>,
    pub timeout_secs: Option<i32>,
    pub is_enabled: Option<bool>,
    pub version: Option<String>,
}

// ---------------------------------------------------------------------------
// Execution statuses (lookup)
// ---------------------------------------------------------------------------

/// An execution lifecycle status (pending, running, completed, failed, timeout).
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct ExecutionStatus {
    pub id: i16,
    pub name: String,
    pub label: String,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

// ---------------------------------------------------------------------------
// Script executions
// ---------------------------------------------------------------------------

/// A single script execution record with full I/O capture.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct ScriptExecution {
    pub id: DbId,
    pub script_id: DbId,
    pub job_id: Option<DbId>,
    pub triggered_by: Option<DbId>,
    pub status_id: i16,
    /// Joined from `execution_statuses.name`.
    pub status_name: String,
    pub input_data: Option<serde_json::Value>,
    pub output_data: Option<serde_json::Value>,
    pub stdout_log: Option<String>,
    pub stderr_log: Option<String>,
    pub exit_code: Option<i32>,
    pub duration_ms: Option<i32>,
    pub error_message: Option<String>,
    pub started_at: Option<Timestamp>,
    pub completed_at: Option<Timestamp>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// DTO for creating a new execution record.
#[derive(Debug, Clone)]
pub struct CreateScriptExecution {
    pub script_id: DbId,
    pub job_id: Option<DbId>,
    pub triggered_by: Option<DbId>,
    pub input_data: Option<serde_json::Value>,
}
