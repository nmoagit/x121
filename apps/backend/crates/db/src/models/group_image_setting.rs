//! Group image settings model and DTOs (PRD-154).
//!
//! Intermediate tier of the three-level inheritance chain:
//! image_type (default) -> project settings -> group settings -> avatar overrides.

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};

pub use super::image_type::EffectiveImageSetting;
pub use super::project_image_setting::{ImageSettingUpdate, ToggleImageSettingBody};

/// A row from the `group_image_settings` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct GroupImageSetting {
    pub id: DbId,
    pub group_id: DbId,
    pub image_type_id: DbId,
    pub track_id: Option<DbId>,
    pub is_enabled: bool,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// Type alias for backward compatibility.
pub type EffectiveGroupImageSetting = EffectiveImageSetting;

/// Bulk update request for group image settings.
#[derive(Debug, Clone, Deserialize)]
pub struct BulkGroupImageSettings {
    pub settings: Vec<GroupImageSettingUpdate>,
}

/// Reuse the shared update shape.
pub type GroupImageSettingUpdate = ImageSettingUpdate;
