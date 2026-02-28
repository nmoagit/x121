//! Sensitivity models and DTOs (PRD-82).
//!
//! Covers user sensitivity preferences (blur levels, watermarks,
//! screen-share mode) and the studio-wide minimum sensitivity config.

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};

// ---------------------------------------------------------------------------
// Entity structs (database rows)
// ---------------------------------------------------------------------------

/// A row from the `user_sensitivity_settings` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct UserSensitivitySettings {
    pub id: DbId,
    pub user_id: DbId,
    pub global_level: String,
    pub view_overrides_json: serde_json::Value,
    pub watermark_enabled: bool,
    pub watermark_text: Option<String>,
    pub watermark_position: String,
    pub watermark_opacity: f32,
    pub screen_share_mode: bool,
    pub sound_enabled: bool,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// A row from the `studio_sensitivity_config` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct StudioSensitivityConfig {
    pub id: DbId,
    pub min_level: String,
    pub updated_by: DbId,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

// ---------------------------------------------------------------------------
// DTOs (request payloads)
// ---------------------------------------------------------------------------

/// DTO for upserting user sensitivity settings.
#[derive(Debug, Clone, Deserialize)]
pub struct UpsertSensitivitySettings {
    pub global_level: String,
    pub view_overrides_json: Option<serde_json::Value>,
    pub watermark_enabled: Option<bool>,
    pub watermark_text: Option<String>,
    pub watermark_position: Option<String>,
    pub watermark_opacity: Option<f32>,
    pub screen_share_mode: Option<bool>,
    pub sound_enabled: Option<bool>,
}

/// DTO for upserting studio sensitivity config.
#[derive(Debug, Clone, Deserialize)]
pub struct UpsertStudioSensitivityConfig {
    pub min_level: String,
}
