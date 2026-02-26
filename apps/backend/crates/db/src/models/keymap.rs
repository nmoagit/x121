//! User keymap models and DTOs (PRD-52).
//!
//! Covers user keyboard shortcut presets and custom binding overrides.

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};

// ---------------------------------------------------------------------------
// Entity structs (database rows)
// ---------------------------------------------------------------------------

/// A row from the `user_keymaps` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct UserKeymap {
    pub id: DbId,
    pub user_id: DbId,
    pub active_preset: String,
    pub custom_bindings_json: serde_json::Value,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

// ---------------------------------------------------------------------------
// DTOs (request payloads)
// ---------------------------------------------------------------------------

/// DTO for upserting a user's keymap preferences.
#[derive(Debug, Clone, Deserialize)]
pub struct UpsertKeymap {
    pub active_preset: Option<String>,
    pub custom_bindings_json: Option<serde_json::Value>,
}

/// DTO for importing a keymap from a JSON file.
#[derive(Debug, Clone, Deserialize)]
pub struct ImportKeymapRequest {
    pub keymap_json: serde_json::Value,
}
