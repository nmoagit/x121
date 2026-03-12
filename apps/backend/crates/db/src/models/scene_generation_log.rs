//! Scene generation log model and DTOs.
//!
//! Stores terminal-style log entries produced during the video generation
//! pipeline so that users can follow progress in the frontend.

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};

/// A row from the `scene_generation_logs` table.
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct SceneGenerationLog {
    pub id: DbId,
    pub scene_id: DbId,
    pub level: String,
    pub message: String,
    pub metadata: Option<serde_json::Value>,
    pub created_at: Timestamp,
}

/// DTO for inserting a new generation log entry.
#[derive(Debug, Deserialize)]
pub struct CreateGenerationLog {
    pub scene_id: DbId,
    pub level: String,
    pub message: String,
    pub metadata: Option<serde_json::Value>,
}
