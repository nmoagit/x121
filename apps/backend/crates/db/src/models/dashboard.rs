//! Dashboard configuration entity model and DTOs (PRD-42).

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};

/// A row from the `dashboard_configs` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct DashboardConfig {
    pub id: DbId,
    pub user_id: DbId,
    pub layout_json: serde_json::Value,
    pub widget_settings_json: serde_json::Value,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// DTO for creating or updating a user's dashboard configuration.
#[derive(Debug, Deserialize)]
pub struct SaveDashboardConfig {
    pub layout_json: serde_json::Value,
    pub widget_settings_json: serde_json::Value,
}
