//! Group scene settings model and DTOs.
//!
//! Intermediate tier of the four-level inheritance chain:
//! scene_type (default) -> project settings -> group settings -> character overrides.

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};

pub use super::project_scene_setting::{SceneSettingUpdate, ToggleSettingBody};
pub use super::scene_type::EffectiveSceneSetting;

/// A row from the `group_scene_settings` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct GroupSceneSetting {
    pub id: DbId,
    pub group_id: DbId,
    pub scene_type_id: DbId,
    pub track_id: Option<DbId>,
    pub is_enabled: bool,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// Type alias for backward compatibility. The effective setting struct is
/// shared across all tiers.
pub type EffectiveGroupSceneSetting = EffectiveSceneSetting;

/// Bulk update request for group scene settings.
#[derive(Debug, Clone, Deserialize)]
pub struct BulkGroupSceneSettings {
    pub settings: Vec<GroupSceneSettingUpdate>,
}

/// Reuse the shared update shape.
pub type GroupSceneSettingUpdate = SceneSettingUpdate;
