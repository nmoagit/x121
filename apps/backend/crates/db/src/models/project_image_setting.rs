//! Project image settings model and DTOs (PRD-154).
//!
//! Second tier of the three-level inheritance chain:
//! image_type (default) -> project settings -> group settings -> avatar overrides.

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};

pub use super::image_type::EffectiveImageSetting;

/// A row from the `project_image_settings` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct ProjectImageSetting {
    pub id: DbId,
    pub project_id: DbId,
    pub image_type_id: DbId,
    pub track_id: Option<DbId>,
    pub is_enabled: bool,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// Type alias for backward compatibility.
pub type EffectiveProjectImageSetting = EffectiveImageSetting;

/// Bulk update request for project image settings.
#[derive(Debug, Clone, Deserialize)]
pub struct BulkProjectImageSettings {
    pub settings: Vec<ImageSettingUpdate>,
}

/// A single setting update within a bulk request.
///
/// Shared shape used by all three tiers of image settings.
#[derive(Debug, Clone, Deserialize)]
pub struct ImageSettingUpdate {
    pub image_type_id: DbId,
    pub track_id: Option<DbId>,
    pub is_enabled: bool,
}

/// Backward-compat alias.
pub type ProjectImageSettingUpdate = ImageSettingUpdate;

/// Body for the single-toggle endpoint where image_type_id comes from the URL path.
#[derive(Debug, Clone, Deserialize)]
pub struct ToggleImageSettingBody {
    pub is_enabled: bool,
}
