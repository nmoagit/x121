//! Contact sheet image model and DTOs (PRD-103).

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};

/// A row from the `contact_sheet_images` table.
///
/// Stores a face crop extracted from a representative frame of a scene
/// for a given character. Used to assemble tiled contact sheet grids.
#[derive(Debug, Clone, Serialize, FromRow)]
pub struct ContactSheetImage {
    pub id: DbId,
    pub character_id: DbId,
    pub scene_id: DbId,
    pub face_crop_path: String,
    pub confidence_score: Option<f64>,
    pub frame_number: Option<i32>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// DTO for creating a new contact sheet image record.
#[derive(Debug, Deserialize)]
pub struct CreateContactSheetImage {
    pub character_id: DbId,
    pub scene_id: DbId,
    pub face_crop_path: String,
    pub confidence_score: Option<f64>,
    pub frame_number: Option<i32>,
}
