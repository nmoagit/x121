//! Project speech configuration model (PRD-136).
//!
//! Per-project configuration specifying the required number of speech variants
//! per speech type and language combination.

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};

/// A row from the `project_speech_config` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct ProjectSpeechConfig {
    pub id: DbId,
    pub project_id: DbId,
    pub speech_type_id: i16,
    pub language_id: i16,
    pub min_variants: i32,
    pub created_at: Timestamp,
}

/// DTO for upserting speech config entries.
#[derive(Debug, Deserialize)]
pub struct SpeechConfigEntry {
    pub speech_type_id: i16,
    pub language_id: i16,
    pub min_variants: i32,
}
