//! Poster frame model and DTOs (PRD-96).

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};

/// A row from the `poster_frames` table.
///
/// Stores a selected poster frame for a character or scene entity,
/// including crop and adjustment settings.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct PosterFrame {
    pub id: DbId,
    pub entity_type: String,
    pub entity_id: DbId,
    pub segment_id: DbId,
    pub frame_number: i32,
    pub image_path: String,
    pub crop_settings_json: Option<serde_json::Value>,
    pub brightness: f32,
    pub contrast: f32,
    pub created_by: DbId,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// DTO for upserting a poster frame (insert or replace for a given entity).
#[derive(Debug, Deserialize)]
pub struct UpsertPosterFrame {
    pub segment_id: DbId,
    pub frame_number: i32,
    pub image_path: String,
    pub crop_settings_json: Option<serde_json::Value>,
    pub brightness: Option<f32>,
    pub contrast: Option<f32>,
}

/// DTO for updating only the visual adjustments on an existing poster frame.
#[derive(Debug, Deserialize)]
pub struct UpdatePosterFrameAdjustments {
    pub crop_settings_json: Option<serde_json::Value>,
    pub brightness: Option<f32>,
    pub contrast: Option<f32>,
}
