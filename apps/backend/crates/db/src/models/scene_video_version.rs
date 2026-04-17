//! Scene video version entity model and DTOs.

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use ts_rs::TS;
use x121_core::types::{DbId, Timestamp};

/// A row from the `scene_video_versions` table.
#[derive(Debug, Clone, FromRow, Serialize, TS)]
#[ts(export)]
pub struct SceneVideoVersion {
    #[ts(type = "number")]
    pub id: DbId,
    #[ts(type = "number")]
    pub scene_id: DbId,
    pub version_number: i32,
    pub source: String,
    pub file_path: String,
    #[ts(type = "number | null")]
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
    #[ts(type = "number | null")]
    pub qa_reviewed_by: Option<DbId>,
    #[ts(type = "string | null")]
    pub qa_reviewed_at: Option<Timestamp>,
    pub qa_rejection_reason: Option<String>,
    pub qa_notes: Option<String>,
    #[ts(type = "Record<string, unknown> | null")]
    pub generation_snapshot: Option<serde_json::Value>,
    pub content_hash: Option<String>,
    pub file_purged: bool,
    /// Self-referencing FK to the approved clip this was derived from.
    /// NULL for non-derived clips (e.g., LoRA training chunks).
    #[ts(type = "number | null")]
    pub parent_version_id: Option<DbId>,
    /// Sequential ordering for derived clips (e.g., chunk 0, 1, 2...).
    /// NULL for non-derived clips.
    pub clip_index: Option<i32>,
    /// Denormalized transcode surface state (PRD-169). One of
    /// `pending`, `in_progress`, `completed`, `failed`. The source of truth
    /// remains `transcode_jobs`; this column is a cheap read for
    /// card/player "is this playable?" checks.
    pub transcode_state: String,
    #[ts(type = "string | null")]
    pub deleted_at: Option<Timestamp>,
    #[ts(type = "string")]
    pub created_at: Timestamp,
    #[ts(type = "string")]
    pub updated_at: Timestamp,
    /// Number of annotated frames on this version (computed, not stored).
    #[sqlx(default)]
    #[ts(type = "number")]
    pub annotation_count: i64,
    /// Latest `transcode_jobs.error_message` for this version (PRD-169).
    /// Populated from a LEFT JOIN LATERAL; null when no job exists or success.
    #[sqlx(default)]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub transcode_error: Option<String>,
    /// Latest `transcode_jobs.started_at` for this version — drives the
    /// "processing for N minutes" UI copy (PRD-169).
    #[sqlx(default)]
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(type = "string | null")]
    pub transcode_started_at: Option<Timestamp>,
    /// Latest `transcode_jobs.attempts` for this version (PRD-169).
    #[sqlx(default)]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub transcode_attempts: Option<i32>,
    /// Latest `transcode_jobs.id` for this version — the retry endpoint
    /// `POST /transcode-jobs/{id}/retry` uses it (PRD-169).
    #[sqlx(default)]
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(type = "number | null")]
    pub transcode_job_id: Option<DbId>,
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
    /// Self-referencing FK to the parent clip this was derived from.
    pub parent_version_id: Option<DbId>,
    /// Sequential ordering for derived clips (chunk index).
    pub clip_index: Option<i32>,
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

// ---------------------------------------------------------------------------
// Context-enriched row for browse / derived-clip list endpoints (ADR-001).
// ---------------------------------------------------------------------------

/// A `SceneVideoVersion` row with avatar / scene / track / project context
/// and latest-transcode-job enrichment.
///
/// This struct is the canonical wire format for list-style endpoints that
/// need a clip with its surrounding context. It flattens the full
/// `SceneVideoVersion` via `#[sqlx(flatten)]` so any column added to the
/// table automatically flows through every consumer. Context fields below
/// are named to avoid collision with `SceneVideoVersion`'s columns.
///
/// See ADR-001 for the decision and rationale. The drift bug that motivated
/// this struct (`transcode_state` missing from hand-rolled SELECT in PRD-169)
/// is documented in DRY-TRACKER (DRY-820).
#[derive(Debug, Clone, FromRow, Serialize, TS)]
#[ts(export)]
pub struct SceneVideoVersionWithContext {
    /// Full canonical SVV row — flattened into the top-level JSON object
    /// so the wire format stays flat for the frontend.
    #[sqlx(flatten)]
    #[serde(flatten)]
    #[ts(flatten)]
    pub version: SceneVideoVersion,

    // ── Avatar context ──────────────────────────────────────────────
    #[ts(type = "number")]
    pub avatar_id: DbId,
    pub avatar_name: String,
    pub avatar_is_enabled: bool,

    // ── Scene-type / track context ──────────────────────────────────
    pub scene_type_name: String,
    pub track_name: String,

    // ── Project context ─────────────────────────────────────────────
    #[ts(type = "number")]
    pub project_id: DbId,
    pub project_name: String,

    // ── Parent (derived-clip) context ───────────────────────────────
    /// Parent version's `version_number`, for derived clips.
    /// `None` when this row is not a derived clip.
    pub parent_version_number: Option<i32>,
}

/// Filters accepted by `SceneVideoVersionRepo::list_with_context`.
///
/// Mirrors the query params shape of `/scene-video-versions/browse` so a
/// handler can pass the deserialized params straight through.
#[derive(Debug, Clone, Default, Deserialize)]
pub struct ClipBrowseFilters {
    pub project_id: Option<DbId>,
    pub pipeline_id: Option<DbId>,
    pub scene_type: Option<String>,
    pub track: Option<String>,
    pub source: Option<String>,
    pub qa_status: Option<String>,
    pub show_disabled: Option<bool>,
    pub tag_ids: Option<String>,
    pub exclude_tag_ids: Option<String>,
    pub no_tags: Option<bool>,
    pub search: Option<String>,
    /// Tri-state. `None` = all clips, `Some(true)` = only derived,
    /// `Some(false)` = only non-derived.
    pub has_parent: Option<bool>,
    pub parent_version_id: Option<DbId>,
    /// When set, scopes to derived clips of this avatar (used by
    /// `/avatars/{id}/derived-clips`).
    pub avatar_id: Option<DbId>,
    pub limit: Option<i32>,
    pub offset: Option<i32>,
}
