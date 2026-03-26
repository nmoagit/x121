//! Avatar image override model and DTOs (PRD-154).
//!
//! Leaf tier of the three-level inheritance chain:
//! image_type (default) -> project settings -> group settings -> avatar overrides.

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};

pub use super::image_type::EffectiveImageSetting;
pub use super::project_image_setting::{ImageSettingUpdate, ToggleImageSettingBody};

/// A row from the `avatar_image_overrides` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct AvatarImageOverride {
    pub id: DbId,
    pub avatar_id: DbId,
    pub image_type_id: DbId,
    pub track_id: Option<DbId>,
    pub is_enabled: bool,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// Type alias for backward compatibility.
pub type EffectiveAvatarImageSetting = EffectiveImageSetting;

/// Bulk update request for avatar image overrides.
#[derive(Debug, Clone, Deserialize)]
pub struct BulkAvatarImageOverrides {
    pub overrides: Vec<AvatarImageOverrideUpdate>,
}

/// Backward-compat alias reusing the shared update shape.
pub type AvatarImageOverrideUpdate = ImageSettingUpdate;
