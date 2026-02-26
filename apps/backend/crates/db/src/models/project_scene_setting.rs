//! Project scene settings model and DTOs (PRD-111).
//!
//! Middle tier of the three-level inheritance chain:
//! catalog (default) -> project settings -> character overrides.

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};

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

/// Computed effective setting for a project, including source attribution.
///
/// Used by the list-effective query which LEFT JOINs `scene_catalog`
/// with `project_scene_settings`.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct EffectiveProjectSceneSetting {
    pub scene_catalog_id: DbId,
    pub name: String,
    pub slug: String,
    pub is_enabled: bool,
    /// Either `"catalog"` (default from scene_catalog.is_active) or `"project"`.
    pub source: String,
}

/// Bulk update request for project scene settings.
#[derive(Debug, Clone, Deserialize)]
pub struct BulkProjectSceneSettings {
    pub settings: Vec<ProjectSceneSettingUpdate>,
}

/// A single setting update within a bulk request.
#[derive(Debug, Clone, Deserialize)]
pub struct ProjectSceneSettingUpdate {
    pub scene_catalog_id: DbId,
    pub is_enabled: bool,
}
