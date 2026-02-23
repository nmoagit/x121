//! Workflow models and DTOs (PRD-75).
//!
//! Defines the database row struct for `workflows` and associated
//! create/update/import types used by the API layer.

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use trulience_core::types::{DbId, Timestamp};

// ---------------------------------------------------------------------------
// Entity
// ---------------------------------------------------------------------------

/// A workflow row from the `workflows` table.
#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
pub struct Workflow {
    pub id: DbId,
    pub name: String,
    pub description: Option<String>,
    pub current_version: i32,
    pub status_id: DbId,
    pub json_content: serde_json::Value,
    pub discovered_params_json: Option<serde_json::Value>,
    pub validation_results_json: Option<serde_json::Value>,
    pub imported_from: Option<String>,
    pub imported_by: Option<DbId>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

// ---------------------------------------------------------------------------
// Create DTO (internal, used by repository)
// ---------------------------------------------------------------------------

/// Input for creating a new workflow record.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateWorkflow {
    pub name: String,
    pub description: Option<String>,
    pub json_content: serde_json::Value,
    pub discovered_params_json: Option<serde_json::Value>,
    pub imported_from: Option<String>,
    pub imported_by: Option<DbId>,
}

// ---------------------------------------------------------------------------
// Update DTO
// ---------------------------------------------------------------------------

/// Input for updating an existing workflow.
#[derive(Debug, Clone, Deserialize)]
pub struct UpdateWorkflow {
    pub name: Option<String>,
    pub description: Option<String>,
    pub json_content: Option<serde_json::Value>,
    pub status_id: Option<DbId>,
}

// ---------------------------------------------------------------------------
// API request types
// ---------------------------------------------------------------------------

/// Request body for importing a new workflow via the API.
#[derive(Debug, Clone, Deserialize)]
pub struct ImportWorkflowRequest {
    pub name: String,
    pub description: Option<String>,
    pub json_content: serde_json::Value,
}
