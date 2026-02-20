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
}
