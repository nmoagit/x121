//! Character entity model and DTOs.

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use trulience_core::types::{DbId, Timestamp};

use crate::models::status::StatusId;

/// A character row from the `characters` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct Character {
    pub id: DbId,
    pub project_id: DbId,
    pub name: String,
    pub status_id: StatusId,
    pub metadata: Option<serde_json::Value>,
    /// NOT NULL in the database; defaults to `{}`.
    pub settings: serde_json::Value,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// DTO for creating a new character.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateCharacter {
    pub project_id: DbId,
    pub name: String,
    /// Defaults to 1 (Draft) if omitted.
    pub status_id: Option<StatusId>,
    pub metadata: Option<serde_json::Value>,
    pub settings: Option<serde_json::Value>,
}

/// DTO for updating an existing character. All fields are optional.
#[derive(Debug, Clone, Deserialize)]
pub struct UpdateCharacter {
    pub name: Option<String>,
    pub status_id: Option<StatusId>,
    pub metadata: Option<serde_json::Value>,
    pub settings: Option<serde_json::Value>,
}
