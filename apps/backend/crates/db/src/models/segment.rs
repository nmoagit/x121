//! Segment entity model and DTOs.

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use trulience_core::types::{DbId, Timestamp};

use crate::models::status::StatusId;

/// A row from the `segments` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct Segment {
    pub id: DbId,
    pub scene_id: DbId,
    pub sequence_index: i32,
    pub status_id: StatusId,
    pub seed_frame_path: Option<String>,
    pub output_video_path: Option<String>,
    pub last_frame_path: Option<String>,
    pub quality_scores: Option<serde_json::Value>,
    // -- Generation state (PRD-24) --
    pub duration_secs: Option<f64>,
    pub cumulative_duration_secs: Option<f64>,
    pub boundary_frame_index: Option<i32>,
    pub boundary_selection_mode: Option<String>,
    pub generation_started_at: Option<Timestamp>,
    pub generation_completed_at: Option<Timestamp>,
    pub worker_id: Option<DbId>,
    pub prompt_type: Option<String>,
    pub prompt_text: Option<String>,
    // -- Timestamps --
    pub deleted_at: Option<Timestamp>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// DTO for creating a new segment.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateSegment {
    pub scene_id: DbId,
    pub sequence_index: i32,
    /// Defaults to 1 (Pending) if omitted.
    pub status_id: Option<StatusId>,
    pub seed_frame_path: Option<String>,
    pub output_video_path: Option<String>,
    pub last_frame_path: Option<String>,
    pub quality_scores: Option<serde_json::Value>,
    // -- Generation state (PRD-24) --
    pub duration_secs: Option<f64>,
    pub cumulative_duration_secs: Option<f64>,
    pub boundary_frame_index: Option<i32>,
    pub boundary_selection_mode: Option<String>,
    pub generation_started_at: Option<Timestamp>,
    pub generation_completed_at: Option<Timestamp>,
    pub worker_id: Option<DbId>,
    pub prompt_type: Option<String>,
    pub prompt_text: Option<String>,
}

/// DTO for updating an existing segment. All fields are optional.
#[derive(Debug, Clone, Deserialize)]
pub struct UpdateSegment {
    pub sequence_index: Option<i32>,
    pub status_id: Option<StatusId>,
    pub seed_frame_path: Option<String>,
    pub output_video_path: Option<String>,
    pub last_frame_path: Option<String>,
    pub quality_scores: Option<serde_json::Value>,
    // -- Generation state (PRD-24) --
    pub duration_secs: Option<f64>,
    pub cumulative_duration_secs: Option<f64>,
    pub boundary_frame_index: Option<i32>,
    pub boundary_selection_mode: Option<String>,
    pub generation_started_at: Option<Timestamp>,
    pub generation_completed_at: Option<Timestamp>,
    pub worker_id: Option<DbId>,
    pub prompt_type: Option<String>,
    pub prompt_text: Option<String>,
}
