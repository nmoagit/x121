//! Library avatar and project-avatar link models and DTOs (PRD-60).

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};

/* --------------------------------------------------------------------------
Library Avatar
-------------------------------------------------------------------------- */

/// A row from the `library_avatars` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct LibraryAvatar {
    pub id: DbId,
    pub name: String,
    pub source_avatar_id: Option<DbId>,
    pub source_project_id: Option<DbId>,
    pub master_metadata: serde_json::Value,
    pub tags: serde_json::Value,
    pub description: Option<String>,
    pub thumbnail_path: Option<String>,
    pub is_published: bool,
    pub created_by_id: DbId,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// DTO for creating a new library avatar.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateLibraryAvatar {
    pub name: String,
    pub source_avatar_id: Option<DbId>,
    pub source_project_id: Option<DbId>,
    pub master_metadata: Option<serde_json::Value>,
    pub tags: Option<serde_json::Value>,
    pub description: Option<String>,
    pub thumbnail_path: Option<String>,
    pub is_published: Option<bool>,
}

/// DTO for updating an existing library avatar. All fields are optional.
#[derive(Debug, Clone, Deserialize)]
pub struct UpdateLibraryAvatar {
    pub name: Option<String>,
    pub master_metadata: Option<serde_json::Value>,
    pub tags: Option<serde_json::Value>,
    pub description: Option<String>,
    pub thumbnail_path: Option<String>,
    pub is_published: Option<bool>,
}

/* --------------------------------------------------------------------------
Project Avatar Link
-------------------------------------------------------------------------- */

/// A row from the `project_avatar_links` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct ProjectAvatarLink {
    pub id: DbId,
    pub project_id: DbId,
    pub library_avatar_id: DbId,
    pub project_avatar_id: DbId,
    pub linked_fields: serde_json::Value,
    pub imported_at: Timestamp,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// DTO for creating a new project-avatar link.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateProjectAvatarLink {
    pub project_id: DbId,
    pub library_avatar_id: DbId,
    pub project_avatar_id: DbId,
    pub linked_fields: Option<serde_json::Value>,
}

/* --------------------------------------------------------------------------
Import Request (handler-level DTO)
-------------------------------------------------------------------------- */

/// Request body for importing a library avatar into a project.
#[derive(Debug, Clone, Deserialize)]
pub struct ImportAvatarRequest {
    pub project_id: DbId,
    pub linked_fields: Option<Vec<String>>,
}

/* --------------------------------------------------------------------------
Usage Entry (read-only view)
-------------------------------------------------------------------------- */

/// A single entry in the cross-project usage view for a library avatar.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct LibraryUsageEntry {
    pub link_id: DbId,
    pub project_id: DbId,
    pub project_name: String,
    pub project_avatar_id: DbId,
    pub avatar_name: String,
    pub imported_at: Timestamp,
}
