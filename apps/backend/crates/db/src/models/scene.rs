//! Scene entity model and DTOs.

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use trulience_core::types::{DbId, Timestamp};

use crate::models::status::StatusId;

/// A row from the `scenes` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct Scene {
    pub id: DbId,
    pub character_id: DbId,
    pub scene_type_id: DbId,
    pub image_variant_id: DbId,
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

/// DTO for creating a new scene.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateScene {
    pub character_id: DbId,
    pub scene_type_id: DbId,
    pub image_variant_id: DbId,
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
