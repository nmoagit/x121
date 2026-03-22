//! Avatar scene override model and DTOs (PRD-111, PRD-123).
//!
//! Leaf tier of the four-level inheritance chain:
//! scene_type (default) -> project settings -> group settings -> avatar overrides.

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};

pub use super::project_scene_setting::{SceneSettingUpdate, ToggleSettingBody};
pub use super::scene_type::EffectiveSceneSetting;

/// A row from the `avatar_scene_overrides` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct AvatarSceneOverride {
    pub id: DbId,
    pub avatar_id: DbId,
    pub scene_type_id: DbId,
    pub track_id: Option<DbId>,
    pub is_enabled: bool,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// Type alias for backward compatibility. The effective setting struct is
/// shared across the project and avatar tiers.
pub type EffectiveAvatarSceneSetting = EffectiveSceneSetting;

/// Bulk update request for avatar scene overrides.
#[derive(Debug, Clone, Deserialize)]
pub struct BulkAvatarSceneOverrides {
    pub overrides: Vec<AvatarSceneOverrideUpdate>,
}

/// Backward-compat alias reusing the shared update shape.
pub type AvatarSceneOverrideUpdate = SceneSettingUpdate;
