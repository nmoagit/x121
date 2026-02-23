//! Frame annotation model and DTOs (PRD-70).

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use trulience_core::types::{DbId, Timestamp};

/// A row from the `frame_annotations` table.
#[derive(Debug, Clone, Serialize, FromRow)]
pub struct FrameAnnotation {
    pub id: DbId,
    pub segment_id: DbId,
    pub user_id: DbId,
    pub frame_number: i32,
    pub annotations_json: serde_json::Value,
    pub review_note_id: Option<DbId>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// DTO for creating a new frame annotation.
#[derive(Debug, Deserialize)]
pub struct CreateFrameAnnotation {
    pub frame_number: i32,
    pub annotations_json: serde_json::Value,
    pub review_note_id: Option<DbId>,
}

/// DTO for updating an existing frame annotation.
#[derive(Debug, Deserialize)]
pub struct UpdateFrameAnnotation {
    pub annotations_json: Option<serde_json::Value>,
    pub review_note_id: Option<DbId>,
}

/// Aggregated annotation summary for a segment.
#[derive(Debug, Serialize)]
pub struct AnnotationSummary {
    pub total_annotations: i64,
    pub annotated_frames: i64,
    pub annotators: Vec<DbId>,
}
