//! Character metadata version entity model and DTOs.

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};

/// A row from the `character_metadata_versions` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct CharacterMetadataVersion {
    pub id: DbId,
    pub character_id: DbId,
    pub version_number: i32,
    pub metadata: serde_json::Value,
    pub source: String,
    pub source_bio: Option<serde_json::Value>,
    pub source_tov: Option<serde_json::Value>,
    pub generation_report: Option<serde_json::Value>,
    pub is_active: bool,
    pub notes: Option<String>,
    pub rejection_reason: Option<String>,
    pub deleted_at: Option<Timestamp>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// DTO for creating a new character metadata version.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateCharacterMetadataVersion {
    pub character_id: DbId,
    pub metadata: serde_json::Value,
    pub source: String,
    pub source_bio: Option<serde_json::Value>,
    pub source_tov: Option<serde_json::Value>,
    pub generation_report: Option<serde_json::Value>,
    pub is_active: Option<bool>,
    pub notes: Option<String>,
}

/// DTO for updating a character metadata version.
#[derive(Debug, Clone, Deserialize)]
pub struct UpdateCharacterMetadataVersion {
    pub notes: Option<String>,
    pub rejection_reason: Option<String>,
}
