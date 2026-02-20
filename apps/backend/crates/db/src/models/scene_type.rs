//! Scene type entity model and DTOs.

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use trulience_core::types::{DbId, Timestamp};

use crate::models::status::StatusId;

/// A row from the `scene_types` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct SceneType {
    pub id: DbId,
    pub project_id: Option<DbId>,
    pub name: String,
    pub status_id: StatusId,
    pub workflow_json: Option<serde_json::Value>,
    pub lora_config: Option<serde_json::Value>,
    pub prompt_template: Option<String>,
    pub target_duration_secs: Option<i32>,
    pub segment_duration_secs: Option<i32>,
    pub variant_applicability: String,
    pub transition_segment_index: Option<i32>,
    pub is_studio_level: bool,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// DTO for creating a new scene type.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateSceneType {
    pub project_id: Option<DbId>,
    pub name: String,
    /// Defaults to 1 (Draft) if omitted.
    pub status_id: Option<StatusId>,
    pub workflow_json: Option<serde_json::Value>,
    pub lora_config: Option<serde_json::Value>,
    pub prompt_template: Option<String>,
    pub target_duration_secs: Option<i32>,
    pub segment_duration_secs: Option<i32>,
    pub variant_applicability: Option<String>,
    pub transition_segment_index: Option<i32>,
    pub is_studio_level: Option<bool>,
}

/// DTO for updating an existing scene type. All fields are optional.
#[derive(Debug, Clone, Deserialize)]
pub struct UpdateSceneType {
    pub name: Option<String>,
    pub status_id: Option<StatusId>,
    pub workflow_json: Option<serde_json::Value>,
    pub lora_config: Option<serde_json::Value>,
    pub prompt_template: Option<String>,
    pub target_duration_secs: Option<i32>,
    pub segment_duration_secs: Option<i32>,
    pub variant_applicability: Option<String>,
    pub transition_segment_index: Option<i32>,
    pub is_studio_level: Option<bool>,
}
