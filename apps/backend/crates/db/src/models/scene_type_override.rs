//! Scene type field-level override model and DTOs (PRD-100).

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};

/// A row from the `scene_type_overrides` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct SceneTypeOverride {
    pub id: DbId,
    pub scene_type_id: DbId,
    pub field_name: String,
    pub override_value: serde_json::Value,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// DTO for upserting a scene type field override.
#[derive(Debug, Clone, Deserialize)]
pub struct UpsertOverride {
    pub field_name: String,
    pub override_value: serde_json::Value,
}
