//! Character speech model and DTOs (PRD-124).
//!
//! Stores versioned speech text entries per character, categorized by
//! speech type (Greeting, Farewell, etc.).

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};

/// A row from the `character_speeches` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct CharacterSpeech {
    pub id: DbId,
    pub character_id: DbId,
    pub speech_type_id: i16,
    pub version: i32,
    pub text: String,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
    pub deleted_at: Option<Timestamp>,
}

/// DTO for creating a new character speech entry.
#[derive(Debug, Deserialize)]
pub struct CreateCharacterSpeech {
    pub speech_type_id: i16,
    pub text: String,
}

/// DTO for updating an existing character speech entry.
#[derive(Debug, Deserialize)]
pub struct UpdateCharacterSpeech {
    pub text: String,
}
