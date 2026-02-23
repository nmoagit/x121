//! Prompt version models and DTOs (PRD-63).
//!
//! Defines the database row struct for `prompt_versions` and associated
//! create/restore types used by the API layer.

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use trulience_core::types::{DbId, Timestamp};

// ---------------------------------------------------------------------------
// Entity
// ---------------------------------------------------------------------------

/// A prompt version row from the `prompt_versions` table.
#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
pub struct PromptVersion {
    pub id: DbId,
    pub scene_type_id: DbId,
    pub version: i32,
    pub positive_prompt: String,
    pub negative_prompt: Option<String>,
    pub change_notes: Option<String>,
    pub created_by_id: DbId,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

// ---------------------------------------------------------------------------
// Create DTO
// ---------------------------------------------------------------------------

/// Input for creating a new prompt version record.
#[derive(Debug, Clone, Deserialize)]
pub struct CreatePromptVersion {
    pub scene_type_id: DbId,
    pub positive_prompt: String,
    pub negative_prompt: Option<String>,
    pub change_notes: Option<String>,
    pub created_by_id: DbId,
}

// ---------------------------------------------------------------------------
// API request types
// ---------------------------------------------------------------------------

/// Request body for restoring an older prompt version.
#[derive(Debug, Clone, Deserialize)]
pub struct RestoreVersionRequest {
    pub version_id: DbId,
}
