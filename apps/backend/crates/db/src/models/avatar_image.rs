//! Per-avatar image instance model and DTOs (PRD-154).
//!
//! Tracks the lifecycle of each image generated for an avatar,
//! mirroring the `scenes` pattern.

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};

/// Avatar image status constants.
pub mod status {
    /// Image is pending generation.
    pub const PENDING: i16 = 1;
    /// Image is currently being generated.
    pub const GENERATING: i16 = 2;
    /// Image has been generated but not reviewed.
    pub const GENERATED: i16 = 3;
    /// Image has been approved.
    pub const APPROVED: i16 = 4;
    /// Image has been rejected.
    pub const REJECTED: i16 = 5;
    /// Image generation failed.
    pub const FAILED: i16 = 6;
}

/// A row from the `avatar_images` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct AvatarImage {
    pub id: DbId,
    pub avatar_id: DbId,
    pub image_type_id: DbId,
    pub track_id: Option<DbId>,
    pub media_variant_id: Option<DbId>,
    pub status_id: i16,
    pub generation_started_at: Option<Timestamp>,
    pub generation_completed_at: Option<Timestamp>,
    pub deleted_at: Option<Timestamp>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// Enriched avatar image with joined image type name, track name, and
/// media variant info for display in the UI.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct AvatarImageDetail {
    pub id: DbId,
    pub avatar_id: DbId,
    pub image_type_id: DbId,
    pub track_id: Option<DbId>,
    pub media_variant_id: Option<DbId>,
    pub status_id: i16,
    pub generation_started_at: Option<Timestamp>,
    pub generation_completed_at: Option<Timestamp>,
    pub deleted_at: Option<Timestamp>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
    /// Joined from `image_types`.
    pub image_type_name: String,
    /// Joined from `tracks` (nullable when track_id is NULL).
    pub track_name: Option<String>,
    /// Joined from `media_variants` (nullable when not yet assigned).
    pub variant_file_path: Option<String>,
}

/// DTO for creating a new avatar image instance.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateAvatarImage {
    /// Set from the URL path by the handler — not required in the request body.
    #[serde(default)]
    pub avatar_id: DbId,
    pub image_type_id: DbId,
    pub track_id: Option<DbId>,
    pub media_variant_id: Option<DbId>,
    pub status_id: Option<i16>,
}

/// DTO for updating an existing avatar image. All fields are optional.
#[derive(Debug, Clone, Deserialize)]
pub struct UpdateAvatarImage {
    pub status_id: Option<i16>,
    pub media_variant_id: Option<DbId>,
    pub generation_started_at: Option<Timestamp>,
    pub generation_completed_at: Option<Timestamp>,
}
