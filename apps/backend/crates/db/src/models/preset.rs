//! Preset and preset-rating models and DTOs (PRD-27).

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};

/// A row from the `presets` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct Preset {
    pub id: DbId,
    pub name: String,
    pub description: Option<String>,
    pub owner_id: DbId,
    pub scope: String,
    pub project_id: Option<DbId>,
    pub parameters: serde_json::Value,
    pub version: i32,
    pub usage_count: i32,
    pub is_active: bool,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// DTO for creating a new preset.
#[derive(Debug, Clone, Deserialize)]
pub struct CreatePreset {
    pub name: String,
    pub description: Option<String>,
    pub scope: Option<String>,
    pub project_id: Option<DbId>,
    pub parameters: serde_json::Value,
}

/// DTO for updating an existing preset. All fields are optional.
#[derive(Debug, Clone, Deserialize)]
pub struct UpdatePreset {
    pub name: Option<String>,
    pub description: Option<String>,
    pub scope: Option<String>,
    pub project_id: Option<DbId>,
    pub parameters: Option<serde_json::Value>,
}

/// A row from the `preset_ratings` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct PresetRating {
    pub id: DbId,
    pub preset_id: DbId,
    pub user_id: DbId,
    pub rating: i16,
    pub comment: Option<String>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// DTO for creating or updating a preset rating.
#[derive(Debug, Clone, Deserialize)]
pub struct CreatePresetRating {
    pub rating: i16,
    pub comment: Option<String>,
}

/// Preset enriched with aggregated rating data.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct PresetWithRating {
    pub id: DbId,
    pub name: String,
    pub description: Option<String>,
    pub owner_id: DbId,
    pub scope: String,
    pub project_id: Option<DbId>,
    pub parameters: serde_json::Value,
    pub version: i32,
    pub usage_count: i32,
    pub is_active: bool,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
    pub avg_rating: Option<f64>,
    pub rating_count: i64,
}
