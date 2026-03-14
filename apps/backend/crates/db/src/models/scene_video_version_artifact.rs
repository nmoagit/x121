//! Scene video version artifact entity model and DTOs.

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};

/// A row from the `scene_video_version_artifacts` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct SceneVideoVersionArtifact {
    pub id: DbId,
    pub version_id: DbId,
    pub role: String,
    pub label: String,
    pub node_id: Option<String>,
    pub file_path: String,
    pub file_size_bytes: Option<i64>,
    pub duration_secs: Option<f64>,
    pub width: Option<i32>,
    pub height: Option<i32>,
    pub sort_order: i32,
    pub file_purged: bool,
    pub deleted_at: Option<Timestamp>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// DTO for creating a new scene video version artifact.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateArtifact {
    pub version_id: DbId,
    pub role: String,
    pub label: String,
    pub node_id: Option<String>,
    pub file_path: String,
    pub file_size_bytes: Option<i64>,
    pub duration_secs: Option<f64>,
    pub width: Option<i32>,
    pub height: Option<i32>,
    pub sort_order: Option<i32>,
}
