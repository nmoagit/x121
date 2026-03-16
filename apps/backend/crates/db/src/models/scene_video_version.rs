//! Scene video version entity model and DTOs.

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};

/// A row from the `scene_video_versions` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct SceneVideoVersion {
    pub id: DbId,
    pub scene_id: DbId,
    pub version_number: i32,
    pub source: String,
    pub file_path: String,
    pub file_size_bytes: Option<i64>,
    pub duration_secs: Option<f64>,
    pub width: Option<i32>,
    pub height: Option<i32>,
    pub frame_rate: Option<f64>,
    pub preview_path: Option<String>,
    /// Full-resolution H.264 transcode for browser playback (HD mode).
    pub web_playback_path: Option<String>,
    /// Source video codec (e.g. "h264", "mpeg4", "hevc").
    pub video_codec: Option<String>,
    pub is_final: bool,
    pub notes: Option<String>,
    pub qa_status: String,
    pub qa_reviewed_by: Option<DbId>,
    pub qa_reviewed_at: Option<Timestamp>,
    pub qa_rejection_reason: Option<String>,
    pub qa_notes: Option<String>,
    pub generation_snapshot: Option<serde_json::Value>,
    pub content_hash: Option<String>,
    pub file_purged: bool,
    pub deleted_at: Option<Timestamp>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
    /// Number of annotated frames on this version (computed, not stored).
    #[sqlx(default)]
    pub annotation_count: i64,
}

/// DTO for creating a new scene video version.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateSceneVideoVersion {
    pub scene_id: DbId,
    pub source: String,
    pub file_path: String,
    pub file_size_bytes: Option<i64>,
    pub duration_secs: Option<f64>,
    pub is_final: Option<bool>,
    pub notes: Option<String>,
    pub generation_snapshot: Option<serde_json::Value>,
    pub content_hash: Option<String>,
}

/// DTO for updating a scene video version. All fields optional.
#[derive(Debug, Clone, Deserialize)]
pub struct UpdateSceneVideoVersion {
    pub is_final: Option<bool>,
    pub notes: Option<String>,
    pub qa_status: Option<String>,
    pub qa_reviewed_by: Option<DbId>,
    pub qa_reviewed_at: Option<Timestamp>,
    pub qa_rejection_reason: Option<String>,
    pub qa_notes: Option<String>,
}

/// Request body for rejecting a clip.
#[derive(Debug, Clone, Deserialize)]
pub struct RejectClipRequest {
    pub reason: String,
    pub notes: Option<String>,
}

/// Response for a resume-from operation.
#[derive(Debug, Clone, Serialize)]
pub struct ResumeFromResponse {
    pub scene_id: DbId,
    pub resume_from_version: i32,
    pub segments_preserved: i32,
    pub segments_discarded: i32,
    pub status: String,
}
