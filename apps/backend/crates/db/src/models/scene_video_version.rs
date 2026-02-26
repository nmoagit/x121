//! Scene video version entity model and DTOs.

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};

/// A row from the `scene_video_versions` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct SceneVideoVersion {
    pub id: DbId,
    pub scene_id: DbId,
    pub version_number: i32,
    pub source: String,
    pub file_path: String,
    pub file_size_bytes: Option<i64>,
    pub duration_secs: Option<f64>,
    pub is_final: bool,
    pub notes: Option<String>,
    pub deleted_at: Option<Timestamp>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// DTO for creating a new scene video version.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateSceneVideoVersion {
    pub scene_id: DbId,
    pub source: String,
    pub file_path: String,
    pub file_size_bytes: Option<i64>,
    pub duration_secs: Option<f64>,
    pub is_final: Option<bool>,
    pub notes: Option<String>,
}

/// DTO for updating a scene video version. All fields optional.
#[derive(Debug, Clone, Deserialize)]
pub struct UpdateSceneVideoVersion {
    pub is_final: Option<bool>,
    pub notes: Option<String>,
}
