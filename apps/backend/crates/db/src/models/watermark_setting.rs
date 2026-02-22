//! Watermark setting models and DTOs (PRD-39).

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use trulience_core::types::{DbId, Timestamp};

/// A row from the `watermark_settings` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct WatermarkSetting {
    pub id: DbId,
    pub name: String,
    pub watermark_type: String,
    pub content: String,
    pub position: String,
    pub opacity: f32,
    pub include_timecode: bool,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// DTO for creating a new watermark setting.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateWatermarkSetting {
    pub name: String,
    pub watermark_type: String,
    pub content: String,
    pub position: Option<String>,
    pub opacity: Option<f32>,
    pub include_timecode: Option<bool>,
}

/// DTO for updating an existing watermark setting. All fields optional.
#[derive(Debug, Clone, Deserialize)]
pub struct UpdateWatermarkSetting {
    pub name: Option<String>,
    pub watermark_type: Option<String>,
    pub content: Option<String>,
    pub position: Option<String>,
    pub opacity: Option<f32>,
    pub include_timecode: Option<bool>,
}
