//! Avatar entity model and DTOs.

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};

use crate::models::status::StatusId;

/// A avatar row from the `avatars` table.
///
/// Note: `face_embedding` (vector(512)) is intentionally excluded because it is
/// large and not needed in most queries. Use the embedding repo for vector ops.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct Avatar {
    pub id: DbId,
    pub project_id: DbId,
    pub name: String,
    pub status_id: StatusId,
    pub metadata: Option<serde_json::Value>,
    /// NOT NULL in the database; defaults to `{}`.
    pub settings: serde_json::Value,
    pub group_id: Option<DbId>,
    pub deleted_at: Option<Timestamp>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
    // -- PRD-76: Face embedding columns --
    pub face_detection_confidence: Option<f64>,
    pub face_bounding_box: Option<serde_json::Value>,
    pub embedding_status_id: StatusId,
    pub embedding_extracted_at: Option<Timestamp>,
    /// Review workflow status (PRD-129). References `avatar_review_statuses`.
    pub review_status_id: StatusId,
    /// Whether this avatar is enabled for production workflows.
    /// Disabled avatars are hidden from deliverables, readiness, and browse pages.
    pub is_enabled: bool,
    /// Which deliverable sections must be complete for this avatar.
    /// NULL = inherit from group (or project). When set, overrides the group/project default.
    pub blocking_deliverables: Option<Vec<String>>,
}

/// A avatar row enriched with the best avatar variant ID.
///
/// Returned by `list_by_project_with_avatar` to avoid N+1 queries
/// when the frontend needs thumbnail URLs for avatar cards.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct AvatarWithAvatar {
    pub id: DbId,
    pub project_id: DbId,
    pub name: String,
    pub status_id: StatusId,
    pub metadata: Option<serde_json::Value>,
    pub settings: serde_json::Value,
    pub group_id: Option<DbId>,
    pub deleted_at: Option<Timestamp>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
    pub face_detection_confidence: Option<f64>,
    pub face_bounding_box: Option<serde_json::Value>,
    pub embedding_status_id: StatusId,
    pub embedding_extracted_at: Option<Timestamp>,
    /// Review workflow status (PRD-129). References `avatar_review_statuses`.
    pub review_status_id: StatusId,
    pub is_enabled: bool,
    /// Which deliverable sections must be complete for this avatar.
    /// NULL = inherit from group (or project). When set, overrides the group/project default.
    pub blocking_deliverables: Option<Vec<String>>,
    /// The ID of the best avatar variant (hero clothed > hero any > approved clothed > approved any).
    /// `None` when the avatar has no suitable image variants.
    pub hero_variant_id: Option<DbId>,
}

/// Per-avatar deliverable status for the project overview grid.
///
/// Returned by `AvatarRepo::list_deliverable_status` — a single query
/// with LEFT JOINs + aggregates across media_variants, scenes,
/// scene_video_versions, and avatar_metadata_versions.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct AvatarDeliverableRow {
    pub id: DbId,
    pub name: String,
    pub group_id: Option<DbId>,
    pub status_id: StatusId,
    pub images_count: i64,
    pub images_approved: i64,
    /// Number of active tracks — each avatar needs one seed image per track.
    pub required_images_count: i64,
    pub scenes_total: i64,
    pub scenes_with_video: i64,
    pub scenes_approved: i64,
    pub has_active_metadata: bool,
    pub metadata_approval_status: Option<String>,
    /// The `source` column of the active metadata version (e.g. "generated", "json_import", "manual").
    pub metadata_source: Option<String>,
    /// True when the active metadata version has both `source_bio` and `source_tov` populated.
    pub has_source_files: bool,
    pub has_voice_id: bool,
    pub blocking_reasons: Vec<String>,
    pub readiness_pct: f64,
    pub hero_variant_id: Option<DbId>,
}

/// A avatar row enriched with project context for the library browser.
///
/// Returned by `AvatarRepo::list_all_for_library` to provide a cross-project
/// read-only browsing view of all avatars.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct LibraryAvatarRow {
    pub id: DbId,
    pub name: String,
    pub project_id: DbId,
    pub project_name: String,
    pub group_name: Option<String>,
    pub hero_variant_id: Option<DbId>,
    pub scene_count: i64,
    pub image_count: i64,
    pub clip_count: i64,
    pub has_metadata: bool,
    pub status_id: StatusId,
    pub is_enabled: bool,
    pub created_at: Timestamp,
}

/// DTO for creating a new avatar.
///
/// `project_id` defaults to `0` if omitted from JSON — the API handler
/// always overrides it with the value from the URL path.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateAvatar {
    #[serde(default)]
    pub project_id: DbId,
    pub name: String,
    /// Defaults to 1 (Draft) if omitted.
    pub status_id: Option<StatusId>,
    pub metadata: Option<serde_json::Value>,
    pub settings: Option<serde_json::Value>,
    pub group_id: Option<Option<DbId>>,
}

/// DTO for updating an existing avatar. All fields are optional.
#[derive(Debug, Clone, Deserialize)]
pub struct UpdateAvatar {
    pub name: Option<String>,
    pub status_id: Option<StatusId>,
    pub metadata: Option<serde_json::Value>,
    pub settings: Option<serde_json::Value>,
    pub group_id: Option<Option<DbId>>,
    /// NULL = don't change, Some([]) = reset to inherit from group/project, Some([...]) = override.
    pub blocking_deliverables: Option<Vec<String>>,
}
