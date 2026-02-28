//! Scene artifact model and DTOs (PRD-115).

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};

/// A row from the `scene_artifacts` table.
///
/// Tracks individual chunk/output files produced during workflow-managed
/// video generation for a scene.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct SceneArtifact {
    pub id: DbId,
    pub scene_id: DbId,
    pub artifact_type: String,
    pub sequence_index: Option<i32>,
    pub file_path: String,
    pub duration_secs: Option<f64>,
    pub resolution: Option<String>,
    pub metadata: serde_json::Value,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// DTO for creating a new scene artifact.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateSceneArtifact {
    pub scene_id: DbId,
    pub artifact_type: String,
    pub sequence_index: Option<i32>,
    pub file_path: String,
    pub duration_secs: Option<f64>,
    pub resolution: Option<String>,
    pub metadata: Option<serde_json::Value>,
}

/// DTO for updating an existing scene artifact. All fields are optional.
#[derive(Debug, Clone, Deserialize)]
pub struct UpdateSceneArtifact {
    pub artifact_type: Option<String>,
    pub sequence_index: Option<i32>,
    pub file_path: Option<String>,
    pub duration_secs: Option<f64>,
    pub resolution: Option<String>,
    pub metadata: Option<serde_json::Value>,
}
