//! Group-level prompt override model and DTOs.
//!
//! Stores additive prompt fragments at the avatar-group scope, sitting
//! between project overrides and avatar overrides in the resolution
//! hierarchy.

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};

/// A row from the `group_prompt_overrides` table.
///
/// Stores additive prompt fragments for a specific avatar group + scene
/// type + prompt slot combination. The `fragments` JSONB array contains
/// entries of the form `{ "type": "inline"|"fragment_ref", "fragment_id": ..., "text": ... }`.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct GroupPromptOverride {
    pub id: DbId,
    pub group_id: DbId,
    pub scene_type_id: DbId,
    pub prompt_slot_id: DbId,
    pub fragments: serde_json::Value,
    pub override_text: Option<String>,
    pub notes: Option<String>,
    pub created_by: Option<DbId>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// DTO for creating (or upserting) a group prompt override.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateGroupPromptOverride {
    pub group_id: DbId,
    pub scene_type_id: DbId,
    pub prompt_slot_id: DbId,
    pub fragments: serde_json::Value,
    pub override_text: Option<String>,
    pub notes: Option<String>,
    pub created_by: Option<DbId>,
}

/// DTO for updating an existing group prompt override.
#[derive(Debug, Clone, Deserialize)]
pub struct UpdateGroupPromptOverride {
    pub fragments: Option<serde_json::Value>,
    pub override_text: Option<String>,
    pub notes: Option<String>,
}
