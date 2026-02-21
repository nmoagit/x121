//! Workflow layout models and DTOs (PRD-33).
//!
//! Stores the React Flow canvas state and node positions per workflow
//! for the node-based workflow canvas.

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use trulience_core::types::{DbId, Timestamp};

// ---------------------------------------------------------------------------
// Entity struct (database row)
// ---------------------------------------------------------------------------

/// A row from the `workflow_layouts` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct WorkflowLayout {
    pub id: DbId,
    pub workflow_id: DbId,
    pub canvas_json: serde_json::Value,
    pub node_positions_json: serde_json::Value,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

// ---------------------------------------------------------------------------
// DTOs (request payloads)
// ---------------------------------------------------------------------------

/// DTO for creating or updating a workflow layout (upsert).
#[derive(Debug, Clone, Deserialize)]
pub struct CreateWorkflowLayout {
    pub canvas_json: serde_json::Value,
    pub node_positions_json: serde_json::Value,
}
