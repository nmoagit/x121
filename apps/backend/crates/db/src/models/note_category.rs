//! Note category model (PRD-95).

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use trulience_core::types::{DbId, Timestamp};

/// A row from the `note_categories` table.
#[derive(Debug, Clone, Serialize, FromRow)]
pub struct NoteCategory {
    pub id: DbId,
    pub name: String,
    pub color: String,
    pub icon: Option<String>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// DTO for creating a new note category.
#[derive(Debug, Deserialize)]
pub struct CreateNoteCategory {
    pub name: String,
    pub color: Option<String>,
    pub icon: Option<String>,
}

/// DTO for updating a note category.
#[derive(Debug, Deserialize)]
pub struct UpdateNoteCategory {
    pub name: Option<String>,
    pub color: Option<String>,
    pub icon: Option<String>,
}
