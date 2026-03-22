//! Avatar group entity model and DTOs.

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};

/// A row from the `avatar_groups` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct AvatarGroup {
    pub id: DbId,
    pub project_id: DbId,
    pub name: String,
    pub sort_order: i32,
    /// Which deliverable sections must be complete for avatars in this group.
    /// NULL = inherit from project. When set, overrides the project default.
    pub blocking_deliverables: Option<Vec<String>>,
    pub deleted_at: Option<Timestamp>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// DTO for creating a new avatar group.
///
/// `project_id` defaults to `0` if omitted from JSON — the API handler
/// always overrides it with the value from the URL path.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateAvatarGroup {
    #[serde(default)]
    pub project_id: DbId,
    pub name: String,
    pub sort_order: Option<i32>,
}

/// DTO for updating an existing avatar group.
#[derive(Debug, Clone, Deserialize)]
pub struct UpdateAvatarGroup {
    pub name: Option<String>,
    pub sort_order: Option<i32>,
    /// NULL = don't change, Some([]) = reset to inherit from project, Some([...]) = override.
    pub blocking_deliverables: Option<Vec<String>>,
}
