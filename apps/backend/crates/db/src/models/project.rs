//! Project entity model and DTOs.

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};

use crate::models::status::StatusId;

/// A project row from the `projects` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct Project {
    pub id: DbId,
    pub name: String,
    pub description: Option<String>,
    pub status_id: StatusId,
    pub retention_days: Option<i32>,
    pub auto_deliver_on_final: bool,
    pub deleted_at: Option<Timestamp>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
    /// Optional threshold for auto-triggering avatar review (PRD-129).
    pub review_trigger_threshold: Option<i16>,
    /// Which deliverable sections must be complete for a avatar to be "done".
    /// NULL = inherit from platform_settings default. When set, overrides studio default.
    pub blocking_deliverables: Option<Vec<String>>,
    /// Default output format profile for this project's deliveries.
    pub default_format_profile_id: Option<DbId>,
    /// The pipeline this project belongs to (PRD-138).
    pub pipeline_id: DbId,
}

/// DTO for creating a new project.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateProject {
    pub name: String,
    pub description: Option<String>,
    /// Defaults to 1 (Draft) if omitted.
    pub status_id: Option<StatusId>,
    pub retention_days: Option<i32>,
    /// The pipeline this project belongs to (PRD-138).
    pub pipeline_id: DbId,
}

/// DTO for updating an existing project. All fields are optional.
#[derive(Debug, Clone, Deserialize)]
pub struct UpdateProject {
    pub name: Option<String>,
    pub description: Option<String>,
    pub status_id: Option<StatusId>,
    pub retention_days: Option<i32>,
    pub auto_deliver_on_final: Option<bool>,
    pub blocking_deliverables: Option<Vec<String>>,
    /// Double-option: outer `None` = not provided, inner `None` = set to NULL.
    pub default_format_profile_id: Option<Option<DbId>>,
}
