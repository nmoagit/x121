//! Layout models and DTOs (PRD-30).
//!
//! Covers user-saved layouts and admin-managed layout presets for the
//! modular panel management system.

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use trulience_core::types::{DbId, Timestamp};

// ---------------------------------------------------------------------------
// Entity structs (database rows)
// ---------------------------------------------------------------------------

/// A row from the `user_layouts` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct UserLayout {
    pub id: DbId,
    pub user_id: DbId,
    pub layout_name: String,
    pub layout_json: serde_json::Value,
    pub is_default: bool,
    pub is_shared: bool,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// A row from the `admin_layout_presets` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct AdminLayoutPreset {
    pub id: DbId,
    pub name: String,
    pub role_default_for: Option<String>,
    pub layout_json: serde_json::Value,
    pub created_by: DbId,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

// ---------------------------------------------------------------------------
// DTOs (request payloads)
// ---------------------------------------------------------------------------

/// DTO for creating a new user layout.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateUserLayout {
    pub layout_name: String,
    pub layout_json: serde_json::Value,
    pub is_default: Option<bool>,
}

/// DTO for partially updating a user layout.
#[derive(Debug, Clone, Deserialize)]
pub struct UpdateUserLayout {
    pub layout_name: Option<String>,
    pub layout_json: Option<serde_json::Value>,
    pub is_default: Option<bool>,
    pub is_shared: Option<bool>,
}

/// DTO for creating a new admin layout preset.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateAdminPreset {
    pub name: String,
    pub role_default_for: Option<String>,
    pub layout_json: serde_json::Value,
}

/// DTO for partially updating an admin layout preset.
#[derive(Debug, Clone, Deserialize)]
pub struct UpdateAdminPreset {
    pub name: Option<String>,
    pub role_default_for: Option<Option<String>>,
    pub layout_json: Option<serde_json::Value>,
}
