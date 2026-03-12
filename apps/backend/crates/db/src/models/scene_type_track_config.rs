//! Per-(scene_type, track) workflow and prompt override configuration.
//!
//! Allows different workflows and prompt templates for each track within
//! a scene type (e.g. the "clothes_off" track may use a different workflow
//! than the default track for the same scene).

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};

/// A row from the `scene_type_track_configs` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct SceneTypeTrackConfig {
    pub id: DbId,
    pub scene_type_id: DbId,
    pub track_id: DbId,
    pub is_clothes_off: bool,
    pub workflow_id: Option<DbId>,
    pub prompt_template: Option<String>,
    pub negative_prompt_template: Option<String>,
    pub prompt_start_clip: Option<String>,
    pub negative_prompt_start_clip: Option<String>,
    pub prompt_continuation_clip: Option<String>,
    pub negative_prompt_continuation_clip: Option<String>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// Enriched config row that includes the track name and slug (from a JOIN).
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct SceneTypeTrackConfigWithTrack {
    pub id: DbId,
    pub scene_type_id: DbId,
    pub track_id: DbId,
    pub is_clothes_off: bool,
    pub workflow_id: Option<DbId>,
    pub prompt_template: Option<String>,
    pub negative_prompt_template: Option<String>,
    pub prompt_start_clip: Option<String>,
    pub negative_prompt_start_clip: Option<String>,
    pub prompt_continuation_clip: Option<String>,
    pub negative_prompt_continuation_clip: Option<String>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
    pub track_name: String,
    pub track_slug: String,
}

/// DTO for creating (or upserting) a track config.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateSceneTypeTrackConfig {
    pub scene_type_id: DbId,
    pub track_id: DbId,
    pub is_clothes_off: bool,
    pub workflow_id: Option<DbId>,
    pub prompt_template: Option<String>,
    pub negative_prompt_template: Option<String>,
    pub prompt_start_clip: Option<String>,
    pub negative_prompt_start_clip: Option<String>,
    pub prompt_continuation_clip: Option<String>,
    pub negative_prompt_continuation_clip: Option<String>,
}

/// DTO for updating an existing track config. All fields are optional.
#[derive(Debug, Clone, Default, Deserialize)]
pub struct UpdateSceneTypeTrackConfig {
    #[serde(default)]
    pub is_clothes_off: bool,
    pub workflow_id: Option<DbId>,
    pub prompt_template: Option<String>,
    pub negative_prompt_template: Option<String>,
    pub prompt_start_clip: Option<String>,
    pub negative_prompt_start_clip: Option<String>,
    pub prompt_continuation_clip: Option<String>,
    pub negative_prompt_continuation_clip: Option<String>,
}
