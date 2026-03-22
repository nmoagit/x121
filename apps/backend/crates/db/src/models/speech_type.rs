//! Speech type lookup model (PRD-124, PRD-136).
//!
//! A seeded, user-extensible lookup table for categorizing avatar speech
//! entries (e.g. Greeting, Farewell, Flirty).

use serde::Serialize;
use sqlx::FromRow;
use x121_core::types::Timestamp;

/// A row from the `speech_types` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct SpeechType {
    pub id: i16,
    pub name: String,
    pub sort_order: i32,
    pub created_at: Timestamp,
}
