//! Character group entity model and DTOs.

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};

/// A row from the `character_groups` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct CharacterGroup {
    pub id: DbId,
    pub project_id: DbId,
    pub name: String,
    pub sort_order: i32,
    pub deleted_at: Option<Timestamp>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// DTO for creating a new character group.
///
/// `project_id` defaults to `0` if omitted from JSON — the API handler
/// always overrides it with the value from the URL path.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateCharacterGroup {
    #[serde(default)]
    pub project_id: DbId,
    pub name: String,
    pub sort_order: Option<i32>,
}

/// DTO for updating an existing character group.
#[derive(Debug, Clone, Deserialize)]
pub struct UpdateCharacterGroup {
    pub name: Option<String>,
    pub sort_order: Option<i32>,
}
