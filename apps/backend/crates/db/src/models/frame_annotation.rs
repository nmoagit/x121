//! Frame annotation model and DTOs (PRD-70).

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};

/// A row from the `frame_annotations` table.
#[derive(Debug, Clone, Serialize, FromRow)]
pub struct FrameAnnotation {
    pub id: DbId,
    pub segment_id: Option<DbId>,
    pub version_id: Option<DbId>,
    pub image_variant_id: Option<DbId>,
    pub user_id: DbId,
    pub frame_number: i32,
    pub annotations_json: serde_json::Value,
    pub review_note_id: Option<DbId>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// DTO for creating a new frame annotation on a segment.
#[derive(Debug, Deserialize)]
pub struct CreateFrameAnnotation {
    pub frame_number: i32,
    pub annotations_json: serde_json::Value,
    pub review_note_id: Option<DbId>,
}

/// DTO for creating a new frame annotation on a version (clip review).
#[derive(Debug, Deserialize)]
pub struct CreateVersionAnnotation {
    pub frame_number: i32,
    pub annotations_json: serde_json::Value,
}

/// DTO for creating a new frame annotation on an image variant.
#[derive(Debug, Deserialize)]
pub struct CreateImageVariantAnnotation {
    pub frame_number: i32,
    pub annotations_json: serde_json::Value,
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

/// A browseable annotated item with full context (character, scene, project).
#[derive(Debug, Clone, Serialize, FromRow)]
pub struct AnnotatedItem {
    pub annotation_id: DbId,
    pub version_id: Option<DbId>,
    pub segment_id: Option<DbId>,
    pub frame_number: i32,
    pub annotation_count: i32,
    pub character_id: DbId,
    pub character_name: String,
    pub scene_id: DbId,
    pub scene_type_name: String,
    pub scene_status_id: i16,
    pub project_id: DbId,
    pub project_name: String,
    pub file_path: Option<String>,
    pub preview_path: Option<String>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
    pub user_id: DbId,
}
