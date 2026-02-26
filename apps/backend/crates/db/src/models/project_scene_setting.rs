//! Project scene settings model and DTOs (PRD-111).
//!
//! Middle tier of the three-level inheritance chain:
//! catalog (default) -> project settings -> character overrides.

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};

pub use super::scene_catalog::EffectiveSceneSetting;

/// A row from the `project_scene_settings` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct ProjectSceneSetting {
    pub id: DbId,
    pub project_id: DbId,
    pub scene_catalog_id: DbId,
    pub is_enabled: bool,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// Type alias for backward compatibility. The effective setting struct is
/// shared across the project and character tiers.
pub type EffectiveProjectSceneSetting = EffectiveSceneSetting;

/// Bulk update request for project scene settings.
#[derive(Debug, Clone, Deserialize)]
pub struct BulkProjectSceneSettings {
    pub settings: Vec<SceneSettingUpdate>,
}

/// A single setting update within a bulk request.
///
/// Shared shape used by both project and character scene setting updates.
#[derive(Debug, Clone, Deserialize)]
pub struct SceneSettingUpdate {
    pub scene_catalog_id: DbId,
    pub is_enabled: bool,
}

/// Backward-compat alias.
pub type ProjectSceneSettingUpdate = SceneSettingUpdate;
