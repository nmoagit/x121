//! ComfyUI entity models.
//!
//! Models for ComfyUI instance management and execution tracking.

use serde::Serialize;
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};

/// A ComfyUI server instance managed by the bridge.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct ComfyUIInstance {
    pub id: DbId,
    pub name: String,
    pub ws_url: String,
    pub api_url: String,
    pub status_id: DbId,
    pub last_connected_at: Option<Timestamp>,
    pub last_disconnected_at: Option<Timestamp>,
    pub reconnect_attempts: i32,
    pub is_enabled: bool,
    pub metadata: serde_json::Value,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// A ComfyUI instance connection status lookup entry.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct ComfyUIInstanceStatus {
    pub id: DbId,
    pub name: String,
    pub description: Option<String>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// An execution record linking a platform job to a ComfyUI prompt.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct ComfyUIExecution {
    pub id: DbId,
    pub instance_id: DbId,
    pub platform_job_id: DbId,
    pub comfyui_prompt_id: String,
    pub status: String,
    pub progress_percent: i16,
    pub current_node: Option<String>,
    pub error_message: Option<String>,
    pub submitted_at: Timestamp,
    pub started_at: Option<Timestamp>,
    pub completed_at: Option<Timestamp>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}
