//! Character scene prompt override model and DTOs (PRD-115).

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};

/// A row from the `character_scene_prompt_overrides` table.
///
/// Stores additive prompt fragments for a specific character + scene type +
/// prompt slot combination. The `fragments` JSONB array contains entries of
/// the form `{ "type": "inline"|"fragment_ref", "fragment_id": ..., "text": ... }`.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct CharacterScenePromptOverride {
    pub id: DbId,
    pub character_id: DbId,
    pub scene_type_id: DbId,
    pub prompt_slot_id: DbId,
    pub fragments: serde_json::Value,
    pub notes: Option<String>,
    pub created_by: Option<DbId>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// DTO for creating (or upserting) a character scene prompt override.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateCharacterScenePromptOverride {
    pub character_id: DbId,
    pub scene_type_id: DbId,
    pub prompt_slot_id: DbId,
    pub fragments: serde_json::Value,
    pub notes: Option<String>,
    pub created_by: Option<DbId>,
}

/// DTO for updating an existing character scene prompt override.
#[derive(Debug, Clone, Deserialize)]
pub struct UpdateCharacterScenePromptOverride {
    pub fragments: Option<serde_json::Value>,
    pub notes: Option<String>,
}
