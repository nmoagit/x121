//! Theme models and DTOs (PRD-29).
//!
//! Covers theme status lookups, user theme preferences, and custom themes
//! (admin-created token overrides).

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};

// ---------------------------------------------------------------------------
// Entity structs (database rows)
// ---------------------------------------------------------------------------

/// A row from the `theme_statuses` lookup table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct ThemeStatus {
    pub id: i16,
    pub name: String,
    pub label: String,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// A row from the `user_theme_preferences` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct UserThemePreference {
    pub id: DbId,
    pub user_id: DbId,
    pub color_scheme: String,
    pub brand_palette: String,
    pub high_contrast: bool,
    pub custom_theme_id: Option<DbId>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// A row from the `custom_themes` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct CustomTheme {
    pub id: DbId,
    pub name: String,
    pub description: Option<String>,
    pub status_id: i16,
    pub tokens: serde_json::Value,
    pub created_by: Option<DbId>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

// ---------------------------------------------------------------------------
// DTOs (request payloads)
// ---------------------------------------------------------------------------

/// DTO for upserting a user's theme preference.
#[derive(Debug, Clone, Deserialize)]
pub struct UpsertThemePreference {
    pub color_scheme: String,
    pub brand_palette: String,
    pub high_contrast: bool,
    pub custom_theme_id: Option<DbId>,
}

/// DTO for creating a new custom theme.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateCustomTheme {
    pub name: String,
    pub description: Option<String>,
    pub tokens: serde_json::Value,
}

/// DTO for partially updating a custom theme.
#[derive(Debug, Clone, Deserialize)]
pub struct UpdateCustomTheme {
    pub name: Option<String>,
    pub description: Option<String>,
    pub status_id: Option<i16>,
    pub tokens: Option<serde_json::Value>,
}
