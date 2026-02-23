//! Production note model (PRD-95).

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use trulience_core::types::{DbId, Timestamp};

/// A row from the `production_notes` table.
#[derive(Debug, Clone, Serialize, FromRow)]
pub struct ProductionNote {
    pub id: DbId,
    pub entity_type: String,
    pub entity_id: DbId,
    pub user_id: DbId,
    pub content_md: String,
    pub category_id: DbId,
    pub visibility: String,
    pub pinned: bool,
    pub parent_note_id: Option<DbId>,
    pub resolved_at: Option<Timestamp>,
    pub resolved_by: Option<DbId>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// DTO for creating a new production note.
#[derive(Debug, Deserialize)]
pub struct CreateProductionNote {
    pub entity_type: String,
    pub entity_id: DbId,
    pub content_md: String,
    pub category_id: DbId,
    pub visibility: Option<String>,
    pub parent_note_id: Option<DbId>,
}

/// DTO for updating a production note.
#[derive(Debug, Deserialize)]
pub struct UpdateProductionNote {
    pub content_md: Option<String>,
    pub category_id: Option<DbId>,
    pub visibility: Option<String>,
}

/// Query parameters for note search.
#[derive(Debug, Deserialize)]
pub struct NoteSearchParams {
    pub q: String,
    pub entity_type: Option<String>,
}
