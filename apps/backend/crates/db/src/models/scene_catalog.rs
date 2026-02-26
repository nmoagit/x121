//! Scene catalog entity model and DTOs (PRD-111).
//!
//! The scene catalog is a studio-level registry of content concepts
//! (e.g. "Intro", "BJ", "Doggy"). Each entry can be associated with
//! one or more tracks via the `scene_catalog_tracks` junction table.

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};

use super::track::Track;

/// Computed effective scene setting, used by both the project and character
/// tiers of the three-level inheritance chain. Shared to avoid duplication.
///
/// The `source` field indicates which tier provided the value:
/// - `"catalog"`: default from `scene_catalog.is_active`
/// - `"project"`: overridden at the project level
/// - `"character"`: overridden at the character level
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct EffectiveSceneSetting {
    pub scene_catalog_id: DbId,
    pub name: String,
    pub slug: String,
    pub is_enabled: bool,
    pub source: String,
}

/// A row from the `scene_catalog` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct SceneCatalogEntry {
    pub id: DbId,
    pub name: String,
    pub slug: String,
    pub description: Option<String>,
    pub has_clothes_off_transition: bool,
    pub sort_order: i32,
    pub is_active: bool,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// A scene catalog entry enriched with its associated tracks.
#[derive(Debug, Clone, Serialize)]
pub struct SceneCatalogWithTracks {
    #[serde(flatten)]
    pub entry: SceneCatalogEntry,
    pub tracks: Vec<Track>,
}

/// DTO for creating a new scene catalog entry.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateSceneCatalogEntry {
    pub name: String,
    pub slug: String,
    pub description: Option<String>,
    pub has_clothes_off_transition: Option<bool>,
    pub sort_order: Option<i32>,
    pub is_active: Option<bool>,
    /// Track IDs to associate with this entry.
    #[serde(default)]
    pub track_ids: Vec<DbId>,
}

/// DTO for updating an existing scene catalog entry.
/// Slug is immutable and cannot be changed.
#[derive(Debug, Clone, Deserialize)]
pub struct UpdateSceneCatalogEntry {
    pub name: Option<String>,
    pub description: Option<String>,
    pub has_clothes_off_transition: Option<bool>,
    pub sort_order: Option<i32>,
    pub is_active: Option<bool>,
    /// If `Some`, replaces all track associations. If `None`, leaves unchanged.
    pub track_ids: Option<Vec<DbId>>,
}
