//! User recent item entity model and DTOs (PRD-31).

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};

/// A row from the `user_recent_items` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct UserRecentItem {
    pub id: DbId,
    pub user_id: DbId,
    pub entity_type: String,
    pub entity_id: DbId,
    pub access_count: i32,
    pub last_accessed_at: Timestamp,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// DTO for recording an entity access.
#[derive(Debug, Clone, Deserialize)]
pub struct RecordAccessRequest {
    pub entity_type: String,
    pub entity_id: DbId,
}

/// Query parameters for palette search.
#[derive(Debug, Clone, Deserialize)]
pub struct PaletteSearchParams {
    pub q: Option<String>,
    pub limit: Option<i32>,
}
