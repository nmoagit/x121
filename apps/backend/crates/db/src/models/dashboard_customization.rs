//! Dashboard Widget Customization models and DTOs (PRD-89).
//!
//! Defines database row structs for `dashboard_presets` and
//! `dashboard_role_defaults`, plus create/update DTOs.

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};

// ---------------------------------------------------------------------------
// DashboardPreset
// ---------------------------------------------------------------------------

/// A `dashboard_presets` row.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct DashboardPreset {
    pub id: DbId,
    pub user_id: DbId,
    pub name: String,
    pub layout_json: serde_json::Value,
    pub widget_settings_json: serde_json::Value,
    pub is_active: bool,
    pub share_token: Option<String>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// Input for creating a new dashboard preset.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateDashboardPreset {
    pub name: String,
    pub layout_json: serde_json::Value,
    pub widget_settings_json: Option<serde_json::Value>,
}

/// Input for updating an existing dashboard preset. All fields optional.
#[derive(Debug, Clone, Deserialize)]
pub struct UpdateDashboardPreset {
    pub name: Option<String>,
    pub layout_json: Option<serde_json::Value>,
    pub widget_settings_json: Option<serde_json::Value>,
}

// ---------------------------------------------------------------------------
// DashboardRoleDefault
// ---------------------------------------------------------------------------

/// A `dashboard_role_defaults` row.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct DashboardRoleDefault {
    pub id: DbId,
    pub role_name: String,
    pub layout_json: serde_json::Value,
    pub widget_settings_json: serde_json::Value,
    pub configured_by: Option<DbId>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// Input for upserting a dashboard role default.
#[derive(Debug, Clone, Deserialize)]
pub struct UpdateDashboardRoleDefault {
    pub layout_json: serde_json::Value,
    pub widget_settings_json: Option<serde_json::Value>,
}

// ---------------------------------------------------------------------------
// Response DTOs
// ---------------------------------------------------------------------------

/// Resolved effective dashboard layout for a user.
#[derive(Debug, Clone, Serialize)]
pub struct EffectiveDashboardResponse {
    pub layout: serde_json::Value,
    pub widget_settings: serde_json::Value,
    /// Which priority level provided the layout: "preset", "role_default", or "platform_default".
    pub source: &'static str,
}

/// Response from the share-preset endpoint.
#[derive(Debug, Clone, Serialize)]
pub struct SharePresetResponse {
    pub share_token: Option<String>,
    pub preset_id: DbId,
}
