//! Scene type entity model and DTOs.

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};

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
    pub description: Option<String>,
    pub model_config: Option<serde_json::Value>,
    pub negative_prompt_template: Option<String>,
    pub prompt_start_clip: Option<String>,
    pub negative_prompt_start_clip: Option<String>,
    pub prompt_continuation_clip: Option<String>,
    pub negative_prompt_continuation_clip: Option<String>,
    pub target_duration_secs: Option<i32>,
    pub segment_duration_secs: Option<i32>,
    pub duration_tolerance_secs: i32,
    pub transition_segment_index: Option<i32>,
    pub generation_params: Option<serde_json::Value>,
    pub sort_order: i32,
    pub is_active: bool,
    pub is_studio_level: bool,
    pub deleted_at: Option<Timestamp>,
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
    pub description: Option<String>,
    pub model_config: Option<serde_json::Value>,
    pub negative_prompt_template: Option<String>,
    pub prompt_start_clip: Option<String>,
    pub negative_prompt_start_clip: Option<String>,
    pub prompt_continuation_clip: Option<String>,
    pub negative_prompt_continuation_clip: Option<String>,
    pub target_duration_secs: Option<i32>,
    pub segment_duration_secs: Option<i32>,
    pub duration_tolerance_secs: Option<i32>,
    pub transition_segment_index: Option<i32>,
    pub generation_params: Option<serde_json::Value>,
    pub sort_order: Option<i32>,
    pub is_active: Option<bool>,
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
    pub description: Option<String>,
    pub model_config: Option<serde_json::Value>,
    pub negative_prompt_template: Option<String>,
    pub prompt_start_clip: Option<String>,
    pub negative_prompt_start_clip: Option<String>,
    pub prompt_continuation_clip: Option<String>,
    pub negative_prompt_continuation_clip: Option<String>,
    pub target_duration_secs: Option<i32>,
    pub segment_duration_secs: Option<i32>,
    pub duration_tolerance_secs: Option<i32>,
    pub transition_segment_index: Option<i32>,
    pub generation_params: Option<serde_json::Value>,
    pub sort_order: Option<i32>,
    pub is_active: Option<bool>,
    pub is_studio_level: Option<bool>,
}

/// Query params for prompt preview endpoint.
#[derive(Debug, Deserialize)]
pub struct PromptPreviewQuery {
    pub clip_position: Option<String>,
}

/// Request body for matrix generation.
#[derive(Debug, Deserialize)]
pub struct MatrixRequest {
    pub character_ids: Vec<DbId>,
    pub scene_type_ids: Vec<DbId>,
}

/// A single cell in the scene matrix.
#[derive(Debug, Clone, Serialize)]
pub struct MatrixCellDto {
    pub character_id: DbId,
    pub scene_type_id: DbId,
    pub variant_type: String,
    pub existing_scene_id: Option<DbId>,
    pub status: String,
}

/// Prompt preview response with resolution details.
#[derive(Debug, Serialize)]
pub struct PromptPreviewResponse {
    pub positive_prompt: String,
    pub negative_prompt: String,
    pub unresolved_placeholders: Vec<String>,
    pub source: String,
}

/// Validation result for a scene type configuration.
#[derive(Debug, Serialize)]
pub struct ValidationResult {
    pub valid: bool,
    pub errors: Vec<String>,
    pub warnings: Vec<String>,
}
