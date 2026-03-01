//! Character scene override model and DTOs (PRD-111, PRD-123).
//!
//! Leaf tier of the three-level inheritance chain:
//! scene_type (default) -> project settings -> character overrides.

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};

pub use super::project_scene_setting::SceneSettingUpdate;
pub use super::scene_type::EffectiveSceneSetting;

/// A row from the `character_scene_overrides` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct CharacterSceneOverride {
    pub id: DbId,
    pub character_id: DbId,
    pub scene_type_id: DbId,
    pub is_enabled: bool,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// Type alias for backward compatibility. The effective setting struct is
/// shared across the project and character tiers.
pub type EffectiveCharacterSceneSetting = EffectiveSceneSetting;

/// Bulk update request for character scene overrides.
#[derive(Debug, Clone, Deserialize)]
pub struct BulkCharacterSceneOverrides {
    pub overrides: Vec<CharacterSceneOverrideUpdate>,
}

/// Backward-compat alias reusing the shared update shape.
pub type CharacterSceneOverrideUpdate = SceneSettingUpdate;
