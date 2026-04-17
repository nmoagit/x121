//! Transcode job models and DTOs (PRD-169).
//!
//! The `transcode_jobs` table is a polymorphic queue — `entity_type` may in
//! future include more than `scene_video_version` but v1 is scoped to SVV only.

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;
use x121_core::types::{DbId, Timestamp};

// ---------------------------------------------------------------------------
// Status IDs (match the seed in migration 20260417000001).
// ---------------------------------------------------------------------------

pub const TRANSCODE_STATUS_PENDING: i16 = 1;
pub const TRANSCODE_STATUS_IN_PROGRESS: i16 = 2;
pub const TRANSCODE_STATUS_COMPLETED: i16 = 3;
pub const TRANSCODE_STATUS_FAILED: i16 = 4;
pub const TRANSCODE_STATUS_CANCELLED: i16 = 5;

/// Polymorphic entity types registered in the transcode queue.
/// v1 only registers `scene_video_version`.
pub const TRANSCODE_ENTITY_SCENE_VIDEO_VERSION: &str = "scene_video_version";

/// Map a `status_id` to the canonical lowercase `name`.
pub fn status_name_for(status_id: i16) -> &'static str {
    match status_id {
        TRANSCODE_STATUS_PENDING => "pending",
        TRANSCODE_STATUS_IN_PROGRESS => "in_progress",
        TRANSCODE_STATUS_COMPLETED => "completed",
        TRANSCODE_STATUS_FAILED => "failed",
        TRANSCODE_STATUS_CANCELLED => "cancelled",
        _ => "unknown",
    }
}

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------

/// A row from the `transcode_jobs` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct TranscodeJob {
    pub id: DbId,
    pub uuid: Uuid,
    pub entity_type: String,
    pub entity_id: DbId,
    pub status_id: i16,
    pub attempts: i32,
    pub max_attempts: i32,
    pub next_attempt_at: Option<Timestamp>,
    pub source_codec: Option<String>,
    pub source_storage_key: String,
    pub target_storage_key: Option<String>,
    pub error_message: Option<String>,
    pub started_at: Option<Timestamp>,
    pub completed_at: Option<Timestamp>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
    pub deleted_at: Option<Timestamp>,
}

// ---------------------------------------------------------------------------
// DTOs
// ---------------------------------------------------------------------------

/// DTO for creating a new transcode job.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateTranscodeJob {
    pub entity_type: String,
    pub entity_id: DbId,
    pub source_codec: Option<String>,
    pub source_storage_key: String,
}

/// Result of the worker-startup stalled-job recovery pass.
#[derive(Debug, Clone, Copy, Default)]
pub struct RecoverResult {
    /// Stalled rows reset back to `pending` with `attempts` incremented.
    pub reset_count: i64,
    /// Stalled rows whose incremented `attempts` would exceed `max_attempts`
    /// and were therefore marked `failed`.
    pub failed_count: i64,
}

/// Filter for the admin list endpoint.
#[derive(Debug, Clone, Default, Deserialize)]
pub struct AdminListFilter {
    /// Lowercase status name (e.g. "pending").
    pub status: Option<String>,
    pub entity_type: Option<String>,
    pub created_since: Option<Timestamp>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}
