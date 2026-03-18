//! Scene entity model and DTOs.

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};

use crate::models::status::StatusId;

/// A row from the `scenes` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct Scene {
    pub id: DbId,
    pub character_id: DbId,
    pub scene_type_id: DbId,
    pub image_variant_id: Option<DbId>,
    pub track_id: Option<DbId>,
    pub status_id: StatusId,
    pub transition_mode: String,
    // -- Generation state (PRD-24) --
    pub total_segments_estimated: Option<i32>,
    pub total_segments_completed: i32,
    pub actual_duration_secs: Option<f64>,
    pub transition_segment_index: Option<i32>,
    pub generation_started_at: Option<Timestamp>,
    pub generation_completed_at: Option<Timestamp>,
    // -- Resolution tier (PRD-59) --
    pub resolution_tier_id: Option<DbId>,
    pub upscaled_from_scene_id: Option<DbId>,
    // -- Timestamps --
    pub deleted_at: Option<Timestamp>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// A scene row enriched with the latest video version info.
///
/// Returned by `list_by_character_with_versions` to avoid N+1 queries
/// when the frontend needs to show video thumbnails in the scene grid.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct SceneWithVersion {
    pub id: DbId,
    pub character_id: DbId,
    pub scene_type_id: DbId,
    pub image_variant_id: Option<DbId>,
    pub track_id: Option<DbId>,
    pub status_id: StatusId,
    pub transition_mode: String,
    pub total_segments_estimated: Option<i32>,
    pub total_segments_completed: i32,
    pub actual_duration_secs: Option<f64>,
    pub transition_segment_index: Option<i32>,
    pub generation_started_at: Option<Timestamp>,
    pub generation_completed_at: Option<Timestamp>,
    pub resolution_tier_id: Option<DbId>,
    pub upscaled_from_scene_id: Option<DbId>,
    pub deleted_at: Option<Timestamp>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
    /// The ID of the best video version (final preferred, else highest version_number).
    /// `None` when the scene has no video versions.
    pub latest_version_id: Option<DbId>,
    /// Total number of non-deleted video versions for this scene.
    pub version_count: i64,
    /// True when a final version exists but newer (higher version_number) versions follow it.
    pub has_newer_than_final: bool,
}

/// Enriched scene info returned by `batch_details`.
///
/// Joins scenes with characters, scene types, and tracks to provide
/// display-friendly names for queue management UIs (PRD-134).
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct SceneDetail {
    pub id: DbId,
    pub character_id: DbId,
    pub character_name: String,
    pub project_id: Option<DbId>,
    pub scene_type_name: String,
    pub track_name: Option<String>,
    pub status_id: StatusId,
}

/// DTO for creating a new scene.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateScene {
    /// Set from the URL path by the handler — not required in the request body.
    #[serde(default)]
    pub character_id: DbId,
    pub scene_type_id: DbId,
    pub image_variant_id: Option<DbId>,
    pub track_id: Option<DbId>,
    /// Defaults to 1 (Pending) if omitted.
    pub status_id: Option<StatusId>,
    pub transition_mode: Option<String>,
    // -- Generation state (PRD-24) --
    pub total_segments_estimated: Option<i32>,
    pub total_segments_completed: Option<i32>,
    pub actual_duration_secs: Option<f64>,
    pub transition_segment_index: Option<i32>,
    pub generation_started_at: Option<Timestamp>,
    pub generation_completed_at: Option<Timestamp>,
}

/// DTO for updating an existing scene. All fields are optional.
#[derive(Debug, Clone, Deserialize)]
pub struct UpdateScene {
    pub scene_type_id: Option<DbId>,
    pub image_variant_id: Option<DbId>,
    pub status_id: Option<StatusId>,
    pub transition_mode: Option<String>,
    // -- Generation state (PRD-24) --
    pub total_segments_estimated: Option<i32>,
    pub total_segments_completed: Option<i32>,
    pub actual_duration_secs: Option<f64>,
    pub transition_segment_index: Option<i32>,
    pub generation_started_at: Option<Timestamp>,
    pub generation_completed_at: Option<Timestamp>,
}
