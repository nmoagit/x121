//! Per-(image_type, track) workflow and prompt override configuration (PRD-154).
//!
//! Allows different workflows and prompt templates for each track within
//! an image type, mirroring `scene_type_track_configs`.

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};

/// A row from the `image_type_track_configs` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct ImageTypeTrackConfig {
    pub id: DbId,
    pub image_type_id: DbId,
    pub track_id: DbId,
    pub workflow_id: Option<DbId>,
    pub prompt_template: Option<String>,
    pub negative_prompt_template: Option<String>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// Enriched config row that includes the track name and slug (from a JOIN).
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct ImageTypeTrackConfigWithTrack {
    pub id: DbId,
    pub image_type_id: DbId,
    pub track_id: DbId,
    pub workflow_id: Option<DbId>,
    pub prompt_template: Option<String>,
    pub negative_prompt_template: Option<String>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
    pub track_name: String,
    pub track_slug: String,
}

/// DTO for creating (or upserting) a track config.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateImageTypeTrackConfig {
    pub image_type_id: DbId,
    pub track_id: DbId,
    pub workflow_id: Option<DbId>,
    pub prompt_template: Option<String>,
    pub negative_prompt_template: Option<String>,
}

/// DTO for updating an existing track config. All fields are optional.
#[derive(Debug, Clone, Default, Deserialize)]
pub struct UpdateImageTypeTrackConfig {
    pub workflow_id: Option<DbId>,
    pub prompt_template: Option<String>,
    pub negative_prompt_template: Option<String>,
}
