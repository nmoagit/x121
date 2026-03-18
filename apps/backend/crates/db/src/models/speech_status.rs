//! Speech status lookup model (PRD-136).
//!
//! A seeded lookup table for speech approval workflow statuses.

use serde::Serialize;
use sqlx::FromRow;
use x121_core::types::Timestamp;

/// Status ID for a draft speech entry.
pub const SPEECH_STATUS_DRAFT: i16 = 1;

/// Status ID for an approved speech entry.
pub const SPEECH_STATUS_APPROVED: i16 = 2;

/// Status ID for a rejected speech entry.
pub const SPEECH_STATUS_REJECTED: i16 = 3;

/// A row from the `speech_statuses` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct SpeechStatus {
    pub id: i16,
    pub name: String,
    pub created_at: Timestamp,
}

/// Map a status name string to its corresponding ID.
///
/// Returns `None` if the name is not recognized.
pub fn status_name_to_id(name: &str) -> Option<i16> {
    match name.to_lowercase().as_str() {
        "draft" => Some(SPEECH_STATUS_DRAFT),
        "approved" => Some(SPEECH_STATUS_APPROVED),
        "rejected" => Some(SPEECH_STATUS_REJECTED),
        _ => None,
    }
}
