//! Undo tree entity model and DTOs (PRD-51).

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use trulience_core::types::{DbId, Timestamp};

/// A row from the `undo_trees` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct UndoTree {
    pub id: DbId,
    pub user_id: DbId,
    pub entity_type: String,
    pub entity_id: DbId,
    pub tree_json: serde_json::Value,
    pub current_node_id: Option<String>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// DTO for saving (upserting) an undo tree.
#[derive(Debug, Deserialize)]
pub struct SaveUndoTree {
    pub tree_json: serde_json::Value,
    pub current_node_id: Option<String>,
}
