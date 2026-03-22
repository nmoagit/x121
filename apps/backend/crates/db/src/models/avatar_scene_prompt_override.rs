//! Avatar scene prompt override model and DTOs (PRD-115).

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};

/// A row from the `avatar_scene_prompt_overrides` table.
///
/// Stores additive prompt fragments for a specific avatar + scene type +
/// prompt slot combination. The `fragments` JSONB array contains entries of
/// the form `{ "type": "inline"|"fragment_ref", "fragment_id": ..., "text": ... }`.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct AvatarScenePromptOverride {
    pub id: DbId,
    pub avatar_id: DbId,
    pub scene_type_id: DbId,
    pub prompt_slot_id: DbId,
    pub fragments: serde_json::Value,
    pub override_text: Option<String>,
    pub notes: Option<String>,
    pub created_by: Option<DbId>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// DTO for creating (or upserting) a avatar scene prompt override.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateAvatarScenePromptOverride {
    pub avatar_id: DbId,
    pub scene_type_id: DbId,
    pub prompt_slot_id: DbId,
    pub fragments: serde_json::Value,
    pub override_text: Option<String>,
    pub notes: Option<String>,
    pub created_by: Option<DbId>,
}

/// DTO for updating an existing avatar scene prompt override.
#[derive(Debug, Clone, Deserialize)]
pub struct UpdateAvatarScenePromptOverride {
    pub fragments: Option<serde_json::Value>,
    pub override_text: Option<String>,
    pub notes: Option<String>,
}
