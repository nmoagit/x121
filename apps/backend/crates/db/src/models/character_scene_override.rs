//! Character scene override model and DTOs (PRD-111).
//!
//! Leaf tier of the three-level inheritance chain:
//! catalog (default) -> project settings -> character overrides.

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};

/// A row from the `character_scene_overrides` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct CharacterSceneOverride {
    pub id: DbId,
    pub character_id: DbId,
    pub scene_catalog_id: DbId,
    pub is_enabled: bool,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// Computed effective setting for a character, including source attribution.
///
/// Produced by the three-level merge query:
/// catalog.is_active -> COALESCE(project_override, catalog.is_active) -> COALESCE(character_override, project_level).
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct EffectiveCharacterSceneSetting {
    pub scene_catalog_id: DbId,
    pub name: String,
    pub slug: String,
    pub is_enabled: bool,
    /// `"catalog"`, `"project"`, or `"character"`.
    pub source: String,
}

/// Bulk update request for character scene overrides.
#[derive(Debug, Clone, Deserialize)]
pub struct BulkCharacterSceneOverrides {
    pub overrides: Vec<CharacterSceneOverrideUpdate>,
}

/// A single override update within a bulk request.
#[derive(Debug, Clone, Deserialize)]
pub struct CharacterSceneOverrideUpdate {
    pub scene_catalog_id: DbId,
    pub is_enabled: bool,
}
