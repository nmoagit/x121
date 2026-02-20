//! Project entity model and DTOs.

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use trulience_core::types::{DbId, Timestamp};

use crate::models::status::StatusId;

/// A project row from the `projects` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct Project {
    pub id: DbId,
    pub name: String,
    pub description: Option<String>,
    pub status_id: StatusId,
    pub retention_days: Option<i32>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// DTO for creating a new project.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateProject {
    pub name: String,
    pub description: Option<String>,
    /// Defaults to 1 (Draft) if omitted.
    pub status_id: Option<StatusId>,
    pub retention_days: Option<i32>,
}

/// DTO for updating an existing project. All fields are optional.
#[derive(Debug, Clone, Deserialize)]
pub struct UpdateProject {
    pub name: Option<String>,
    pub description: Option<String>,
    pub status_id: Option<StatusId>,
    pub retention_days: Option<i32>,
}
