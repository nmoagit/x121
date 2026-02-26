//! Track entity model and DTOs (PRD-111).
//!
//! Tracks replace the hardcoded `variant_applicability` string column
//! on `scene_types`, enabling arbitrary content tracks (e.g. "clothed", "topless").

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};

/// A row from the `tracks` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct Track {
    pub id: DbId,
    pub name: String,
    pub slug: String,
    pub sort_order: i32,
    pub is_active: bool,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// DTO for creating a new track.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateTrack {
    pub name: String,
    pub slug: String,
    pub sort_order: Option<i32>,
    pub is_active: Option<bool>,
}

/// DTO for updating an existing track. All fields optional; slug is immutable.
#[derive(Debug, Clone, Deserialize)]
pub struct UpdateTrack {
    pub name: Option<String>,
    pub sort_order: Option<i32>,
    pub is_active: Option<bool>,
}
