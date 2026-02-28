//! Scene type QA override models and DTOs (PRD-91).
//!
//! Maps to the `scene_type_qa_overrides` table introduced in migration 20260228000004.

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};

// ---------------------------------------------------------------------------
// Entity
// ---------------------------------------------------------------------------

/// A row from the `scene_type_qa_overrides` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct SceneTypeQaOverride {
    pub id: DbId,
    pub scene_type_id: DbId,
    pub qa_profile_id: Option<DbId>,
    pub custom_thresholds: Option<serde_json::Value>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

// ---------------------------------------------------------------------------
// Upsert DTO
// ---------------------------------------------------------------------------

/// DTO for upserting a scene type QA override.
#[derive(Debug, Deserialize)]
pub struct UpsertSceneTypeQaOverride {
    pub qa_profile_id: Option<DbId>,
    pub custom_thresholds: Option<serde_json::Value>,
}
