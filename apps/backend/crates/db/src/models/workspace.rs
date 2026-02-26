//! Workspace state and undo snapshot entity models and DTOs (PRD-04).

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};

// ---------------------------------------------------------------------------
// WorkspaceState
// ---------------------------------------------------------------------------

/// A row from the `workspace_states` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct WorkspaceState {
    pub id: DbId,
    pub user_id: DbId,
    pub device_type: String,
    pub layout_state: serde_json::Value,
    pub navigation_state: serde_json::Value,
    pub preferences: serde_json::Value,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// DTO for updating workspace state. All fields are optional to support
/// partial updates (only the provided fields are merged).
#[derive(Debug, Deserialize)]
pub struct UpdateWorkspaceState {
    pub layout_state: Option<serde_json::Value>,
    pub navigation_state: Option<serde_json::Value>,
    pub preferences: Option<serde_json::Value>,
}

/// Query parameters for workspace endpoints.
#[derive(Debug, Deserialize)]
pub struct WorkspaceQuery {
    pub device_type: Option<String>,
}

// ---------------------------------------------------------------------------
// UndoSnapshot
// ---------------------------------------------------------------------------

/// A row from the `undo_snapshots` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct UndoSnapshot {
    pub id: DbId,
    pub user_id: DbId,
    pub entity_type: String,
    pub entity_id: DbId,
    pub snapshot_data: serde_json::Value,
    pub snapshot_size_bytes: i32,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// DTO for saving an undo snapshot (upsert).
#[derive(Debug, Deserialize)]
pub struct SaveUndoSnapshot {
    pub snapshot_data: serde_json::Value,
}
