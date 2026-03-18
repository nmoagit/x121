//! Character speech model and DTOs (PRD-124, PRD-136).
//!
//! Stores versioned speech text entries per character, categorized by
//! speech type (Greeting, Farewell, etc.) and language.

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
    pub language_id: i16,
    pub status_id: i16,
    pub sort_order: i32,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
    pub deleted_at: Option<Timestamp>,
}

/// DTO for creating a new character speech entry.
#[derive(Debug, Deserialize)]
pub struct CreateCharacterSpeech {
    pub speech_type_id: i16,
    pub text: String,
    /// Language ID; defaults to 1 (English) if not provided.
    pub language_id: Option<i16>,
}

/// DTO for updating an existing character speech entry.
#[derive(Debug, Deserialize)]
pub struct UpdateCharacterSpeech {
    pub text: String,
}

/// DTO for updating the approval status of a speech entry.
#[derive(Debug, Deserialize)]
pub struct UpdateSpeechStatus {
    pub status: String,
}
