//! Project scene settings model and DTOs (PRD-111, PRD-123).
//!
//! Second tier of the four-level inheritance chain:
//! scene_type (default) -> project settings -> group settings -> character overrides.

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};

pub use super::scene_type::EffectiveSceneSetting;

/// A row from the `project_scene_settings` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct ProjectSceneSetting {
    pub id: DbId,
    pub project_id: DbId,
    pub scene_type_id: DbId,
    pub track_id: Option<DbId>,
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
    pub scene_type_id: DbId,
    pub track_id: Option<DbId>,
    pub is_enabled: bool,
}

/// Backward-compat alias.
pub type ProjectSceneSettingUpdate = SceneSettingUpdate;

/// Body for the single-toggle endpoint where scene_type_id comes from the URL path.
#[derive(Debug, Clone, Deserialize)]
pub struct ToggleSettingBody {
    pub is_enabled: bool,
}
