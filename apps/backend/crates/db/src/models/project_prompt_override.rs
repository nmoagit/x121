//! Project-level prompt override model and DTOs.
//!
//! Stores additive prompt fragments at the project scope, sitting between
//! scene-type defaults and group/avatar overrides in the resolution
//! hierarchy.

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};

/// A row from the `project_prompt_overrides` table.
///
/// Stores additive prompt fragments for a specific project + scene type +
/// prompt slot combination. The `fragments` JSONB array contains entries of
/// the form `{ "type": "inline"|"fragment_ref", "fragment_id": ..., "text": ... }`.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct ProjectPromptOverride {
    pub id: DbId,
    pub project_id: DbId,
    pub scene_type_id: DbId,
    pub prompt_slot_id: DbId,
    pub fragments: serde_json::Value,
    pub override_text: Option<String>,
    pub notes: Option<String>,
    pub created_by: Option<DbId>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// DTO for creating (or upserting) a project prompt override.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateProjectPromptOverride {
    pub project_id: DbId,
    pub scene_type_id: DbId,
    pub prompt_slot_id: DbId,
    pub fragments: serde_json::Value,
    pub override_text: Option<String>,
    pub notes: Option<String>,
    pub created_by: Option<DbId>,
}

/// DTO for updating an existing project prompt override.
#[derive(Debug, Clone, Deserialize)]
pub struct UpdateProjectPromptOverride {
    pub fragments: Option<serde_json::Value>,
    pub override_text: Option<String>,
    pub notes: Option<String>,
}
