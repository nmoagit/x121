//! Video settings override models for the 4-level hierarchy:
//! Scene Type -> Project -> Group -> Character.
//!
//! Each level can optionally override duration, fps, and resolution.
//! The most specific non-None value wins during resolution.

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};
use x121_core::video_settings::VideoSettingsLayer;

// ---------------------------------------------------------------------------
// Project level
// ---------------------------------------------------------------------------

/// A row from the `project_video_settings` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct ProjectVideoSettings {
    pub id: DbId,
    pub project_id: DbId,
    pub scene_type_id: DbId,
    pub target_duration_secs: Option<i32>,
    pub target_fps: Option<i32>,
    pub target_resolution: Option<String>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

// ---------------------------------------------------------------------------
// Group level
// ---------------------------------------------------------------------------

/// A row from the `group_video_settings` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct GroupVideoSettings {
    pub id: DbId,
    pub group_id: DbId,
    pub scene_type_id: DbId,
    pub target_duration_secs: Option<i32>,
    pub target_fps: Option<i32>,
    pub target_resolution: Option<String>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

// ---------------------------------------------------------------------------
// Character level
// ---------------------------------------------------------------------------

/// A row from the `character_video_settings` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct CharacterVideoSettings {
    pub id: DbId,
    pub character_id: DbId,
    pub scene_type_id: DbId,
    pub target_duration_secs: Option<i32>,
    pub target_fps: Option<i32>,
    pub target_resolution: Option<String>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

// ---------------------------------------------------------------------------
// Shared upsert DTO
// ---------------------------------------------------------------------------

/// DTO for upserting video settings at any level. All fields are optional;
/// only non-None values will be stored.
#[derive(Debug, Clone, Deserialize)]
pub struct UpsertVideoSettings {
    pub target_duration_secs: Option<i32>,
    pub target_fps: Option<i32>,
    pub target_resolution: Option<String>,
}

// ---------------------------------------------------------------------------
// Conversions to VideoSettingsLayer
// ---------------------------------------------------------------------------

impl From<ProjectVideoSettings> for VideoSettingsLayer {
    fn from(s: ProjectVideoSettings) -> Self {
        Self {
            target_duration_secs: s.target_duration_secs,
            target_fps: s.target_fps,
            target_resolution: s.target_resolution,
        }
    }
}

impl From<GroupVideoSettings> for VideoSettingsLayer {
    fn from(s: GroupVideoSettings) -> Self {
        Self {
            target_duration_secs: s.target_duration_secs,
            target_fps: s.target_fps,
            target_resolution: s.target_resolution,
        }
    }
}

impl From<CharacterVideoSettings> for VideoSettingsLayer {
    fn from(s: CharacterVideoSettings) -> Self {
        Self {
            target_duration_secs: s.target_duration_secs,
            target_fps: s.target_fps,
            target_resolution: s.target_resolution,
        }
    }
}
