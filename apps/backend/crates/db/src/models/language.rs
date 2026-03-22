//! Language lookup model (PRD-136).
//!
//! A seeded lookup table for categorizing avatar speech entries by language.

use serde::Serialize;
use sqlx::FromRow;
use x121_core::types::Timestamp;

/// A row from the `languages` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct Language {
    pub id: i16,
    pub code: String,
    pub name: String,
    pub flag_code: String,
    pub created_at: Timestamp,
}
