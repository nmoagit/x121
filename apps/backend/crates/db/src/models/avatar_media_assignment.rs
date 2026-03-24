//! Avatar media assignment model and DTOs (PRD-146).

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};

/// A row from the `avatar_media_assignments` table.
///
/// Links an avatar to a workflow media slot, specifying which media
/// (image variant, file path, or passthrough track) to inject at generation time.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct AvatarMediaAssignment {
    pub id: DbId,
    pub avatar_id: DbId,
    pub media_slot_id: DbId,
    pub scene_type_id: Option<DbId>,
    pub track_id: Option<DbId>,
    pub image_variant_id: Option<DbId>,
    pub file_path: Option<String>,
    pub media_type: String,
    pub is_passthrough: bool,
    pub passthrough_track_id: Option<DbId>,
    pub notes: Option<String>,
    pub created_by: Option<DbId>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// DTO for creating a new avatar media assignment.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateAvatarMediaAssignment {
    pub avatar_id: DbId,
    pub media_slot_id: DbId,
    pub scene_type_id: Option<DbId>,
    pub track_id: Option<DbId>,
    pub image_variant_id: Option<DbId>,
    pub file_path: Option<String>,
    pub media_type: Option<String>,
    pub is_passthrough: Option<bool>,
    pub passthrough_track_id: Option<DbId>,
    pub notes: Option<String>,
    pub created_by: Option<DbId>,
}

/// DTO for updating an existing avatar media assignment. All fields are optional.
#[derive(Debug, Clone, Deserialize)]
pub struct UpdateAvatarMediaAssignment {
    pub scene_type_id: Option<DbId>,
    pub image_variant_id: Option<DbId>,
    pub file_path: Option<String>,
    pub media_type: Option<String>,
    pub is_passthrough: Option<bool>,
    pub passthrough_track_id: Option<DbId>,
    pub notes: Option<String>,
}
