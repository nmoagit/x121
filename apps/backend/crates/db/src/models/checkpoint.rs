//! Checkpoint entity models and DTOs for pipeline error recovery (PRD-28).

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use trulience_core::types::{DbId, Timestamp};

/// A row from the `checkpoints` table.
///
/// Stores metadata about a pipeline checkpoint. The actual checkpoint data
/// (intermediate frames, latents) lives on the filesystem at [`data_path`].
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct Checkpoint {
    pub id: DbId,
    pub job_id: DbId,
    pub stage_index: i32,
    pub stage_name: String,
    pub data_path: String,
    pub metadata: Option<serde_json::Value>,
    pub size_bytes: Option<i64>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// DTO for creating a new checkpoint via the checkpoint writer.
#[derive(Debug, Deserialize)]
pub struct CreateCheckpoint {
    pub stage_index: i32,
    pub stage_name: String,
    pub data_path: String,
    pub metadata: Option<serde_json::Value>,
    pub size_bytes: Option<i64>,
}

/// Structured failure diagnostics stored as JSONB on the `jobs` table.
///
/// Captures which pipeline stage/node failed, GPU state, ComfyUI errors,
/// and the input state at the point of failure.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FailureDiagnostics {
    pub stage_index: i32,
    pub stage_name: String,
    pub error_message: String,
    pub comfyui_error: Option<String>,
    pub node_id: Option<String>,
    pub gpu_memory_used_mb: Option<u64>,
    pub gpu_memory_total_mb: Option<u64>,
    pub input_state: Option<serde_json::Value>,
    pub timestamp: Timestamp,
}
