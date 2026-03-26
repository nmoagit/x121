//! Image type entity model and DTOs (PRD-154).
//!
//! Image types define generatable images (e.g., "Clothed from Topless") with
//! source/output track associations, ComfyUI workflow assignments, and prompt
//! templates. Mirrors the `scene_types` architecture for image generation.

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};

use crate::models::track::Track;

/// A row from the `image_types` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct ImageType {
    pub id: DbId,
    pub name: String,
    pub slug: String,
    pub description: Option<String>,
    pub pipeline_id: DbId,
    pub workflow_id: Option<DbId>,
    pub source_track_id: Option<DbId>,
    pub output_track_id: Option<DbId>,
    pub prompt_template: Option<String>,
    pub negative_prompt_template: Option<String>,
    pub generation_params: Option<serde_json::Value>,
    pub is_active: bool,
    pub sort_order: i32,
    pub deleted_at: Option<Timestamp>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// An image type enriched with its associated tracks (via `image_type_tracks`).
#[derive(Debug, Clone, Serialize)]
pub struct ImageTypeWithTracks {
    #[serde(flatten)]
    pub image_type: ImageType,
    pub tracks: Vec<Track>,
}

/// Computed effective image setting, shared across all tiers of the
/// three-level inheritance chain (PRD-154):
/// image_type -> project -> group -> avatar.
///
/// The `source` field indicates which tier provided the value.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct EffectiveImageSetting {
    pub image_type_id: DbId,
    pub name: String,
    pub slug: String,
    pub is_enabled: bool,
    pub source: String,
    pub track_id: Option<DbId>,
    pub track_name: Option<String>,
    pub track_slug: Option<String>,
}

/// DTO for creating a new image type.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateImageType {
    pub name: String,
    pub slug: String,
    pub description: Option<String>,
    pub pipeline_id: DbId,
    pub workflow_id: Option<DbId>,
    pub source_track_id: Option<DbId>,
    pub output_track_id: Option<DbId>,
    pub prompt_template: Option<String>,
    pub negative_prompt_template: Option<String>,
    pub generation_params: Option<serde_json::Value>,
    pub is_active: Option<bool>,
    pub sort_order: Option<i32>,
}

/// DTO for updating an existing image type. All fields are optional.
#[derive(Debug, Clone, Default, Deserialize)]
pub struct UpdateImageType {
    pub name: Option<String>,
    pub slug: Option<String>,
    pub description: Option<String>,
    pub workflow_id: Option<DbId>,
    pub source_track_id: Option<DbId>,
    pub output_track_id: Option<DbId>,
    pub prompt_template: Option<String>,
    pub negative_prompt_template: Option<String>,
    pub generation_params: Option<serde_json::Value>,
    pub is_active: Option<bool>,
    pub sort_order: Option<i32>,
    /// When provided, replaces all track associations atomically.
    #[serde(default)]
    pub track_ids: Option<Vec<DbId>>,
}
