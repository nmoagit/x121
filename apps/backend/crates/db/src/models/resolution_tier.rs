//! Resolution tier entity model and DTOs (PRD-59).

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};

/// A row from the `resolution_tiers` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct ResolutionTier {
    pub id: DbId,
    pub name: String,
    pub display_name: String,
    pub width: i32,
    pub height: i32,
    pub quality_settings: serde_json::Value,
    pub speed_factor: f64,
    pub is_default: bool,
    pub sort_order: i32,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// DTO for creating a new resolution tier.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateResolutionTier {
    pub name: String,
    pub display_name: String,
    pub width: i32,
    pub height: i32,
    pub quality_settings: Option<serde_json::Value>,
    pub speed_factor: Option<f64>,
    pub is_default: Option<bool>,
    pub sort_order: Option<i32>,
}

/// Request body for the upscale action on a scene.
#[derive(Debug, Clone, Deserialize)]
pub struct UpscaleRequest {
    pub target_tier_id: DbId,
}

/// Response payload for a successful upscale operation.
#[derive(Debug, Clone, Serialize)]
pub struct UpscaleResponse {
    pub original_scene_id: DbId,
    pub new_scene_id: DbId,
    pub target_tier: String,
}
