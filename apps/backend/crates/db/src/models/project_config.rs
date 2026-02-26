//! Project Configuration Template models and DTOs (PRD-74).
//!
//! Defines the database row struct for `project_configs` and associated
//! create / update / import types used by the repository and API layers.

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};

// ---------------------------------------------------------------------------
// Entity
// ---------------------------------------------------------------------------

/// A project_configs row from the database.
#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
pub struct ProjectConfig {
    pub id: DbId,
    pub name: String,
    pub description: Option<String>,
    pub version: i32,
    pub config_json: serde_json::Value,
    pub source_project_id: Option<DbId>,
    pub is_recommended: bool,
    pub created_by_id: DbId,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

// ---------------------------------------------------------------------------
// Create DTO
// ---------------------------------------------------------------------------

/// Input for creating a new project config record.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateProjectConfig {
    pub name: String,
    pub description: Option<String>,
    pub config_json: serde_json::Value,
    pub source_project_id: Option<DbId>,
}

// ---------------------------------------------------------------------------
// Update DTO
// ---------------------------------------------------------------------------

/// Input for updating an existing project config. All fields are optional.
#[derive(Debug, Clone, Deserialize)]
pub struct UpdateProjectConfig {
    pub name: Option<String>,
    pub description: Option<String>,
    pub config_json: Option<serde_json::Value>,
    pub is_recommended: Option<bool>,
}

// ---------------------------------------------------------------------------
// Import DTO
// ---------------------------------------------------------------------------

/// Request body for importing a config template into a project.
#[derive(Debug, Clone, Deserialize)]
pub struct ImportConfigRequest {
    pub config_id: DbId,
    pub project_id: DbId,
    pub selected_scene_types: Option<Vec<String>>,
}

/// Result summary after importing a config template.
#[derive(Debug, Clone, Serialize)]
pub struct ImportResult {
    pub imported_count: i32,
    pub skipped_count: i32,
    pub details: Vec<String>,
}
