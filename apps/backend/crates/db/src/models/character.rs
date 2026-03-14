//! Character entity model and DTOs.

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};

use crate::models::status::StatusId;

/// A character row from the `characters` table.
///
/// Note: `face_embedding` (vector(512)) is intentionally excluded because it is
/// large and not needed in most queries. Use the embedding repo for vector ops.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct Character {
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
    /// Review workflow status (PRD-129). References `character_review_statuses`.
    pub review_status_id: StatusId,
    /// Whether this character is enabled for production workflows.
    /// Disabled characters are hidden from deliverables, readiness, and browse pages.
    pub is_enabled: bool,
}

/// A character row enriched with the best avatar variant ID.
///
/// Returned by `list_by_project_with_avatar` to avoid N+1 queries
/// when the frontend needs thumbnail URLs for character cards.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct CharacterWithAvatar {
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
    /// Review workflow status (PRD-129). References `character_review_statuses`.
    pub review_status_id: StatusId,
    pub is_enabled: bool,
    /// The ID of the best avatar variant (hero clothed > hero any > approved clothed > approved any).
    /// `None` when the character has no suitable image variants.
    pub hero_variant_id: Option<DbId>,
}

/// Per-character deliverable status for the project overview grid.
///
/// Returned by `CharacterRepo::list_deliverable_status` — a single query
/// with LEFT JOINs + aggregates across image_variants, scenes,
/// scene_video_versions, and character_metadata_versions.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct CharacterDeliverableRow {
    pub id: DbId,
    pub name: String,
    pub group_id: Option<DbId>,
    pub status_id: StatusId,
    pub images_count: i64,
    pub images_approved: i64,
    pub scenes_total: i64,
    pub scenes_with_video: i64,
    pub scenes_approved: i64,
    pub has_active_metadata: bool,
    pub metadata_approval_status: Option<String>,
    pub has_voice_id: bool,
    pub blocking_reasons: Vec<String>,
    pub readiness_pct: f64,
    pub hero_variant_id: Option<DbId>,
}

/// A character row enriched with project context for the library browser.
///
/// Returned by `CharacterRepo::list_all_for_library` to provide a cross-project
/// read-only browsing view of all characters.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct LibraryCharacterRow {
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

/// DTO for creating a new character.
///
/// `project_id` defaults to `0` if omitted from JSON — the API handler
/// always overrides it with the value from the URL path.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateCharacter {
    #[serde(default)]
    pub project_id: DbId,
    pub name: String,
    /// Defaults to 1 (Draft) if omitted.
    pub status_id: Option<StatusId>,
    pub metadata: Option<serde_json::Value>,
    pub settings: Option<serde_json::Value>,
    pub group_id: Option<Option<DbId>>,
}

/// DTO for updating an existing character. All fields are optional.
#[derive(Debug, Clone, Deserialize)]
pub struct UpdateCharacter {
    pub name: Option<String>,
    pub status_id: Option<StatusId>,
    pub metadata: Option<serde_json::Value>,
    pub settings: Option<serde_json::Value>,
    pub group_id: Option<Option<DbId>>,
}
