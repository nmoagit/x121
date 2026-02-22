//! Template model and DTOs (PRD-27).

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use trulience_core::types::{DbId, Timestamp};

/// A row from the `templates` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct Template {
    pub id: DbId,
    pub name: String,
    pub description: Option<String>,
    pub owner_id: DbId,
    pub scope: String,
    pub project_id: Option<DbId>,
    pub workflow_config: serde_json::Value,
    pub parameter_slots: Option<serde_json::Value>,
    pub version: i32,
    pub is_active: bool,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// DTO for creating a new template.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateTemplate {
    pub name: String,
    pub description: Option<String>,
    pub scope: Option<String>,
    pub project_id: Option<DbId>,
    pub workflow_config: serde_json::Value,
    pub parameter_slots: Option<serde_json::Value>,
}

/// DTO for updating an existing template. All fields are optional.
#[derive(Debug, Clone, Deserialize)]
pub struct UpdateTemplate {
    pub name: Option<String>,
    pub description: Option<String>,
    pub scope: Option<String>,
    pub project_id: Option<DbId>,
    pub workflow_config: Option<serde_json::Value>,
    pub parameter_slots: Option<serde_json::Value>,
}
