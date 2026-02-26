//! Tag and entity-tag models and DTOs (PRD-47).

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};

// ---------------------------------------------------------------------------
// Entity structs (database rows)
// ---------------------------------------------------------------------------

/// A row from the `tags` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct Tag {
    pub id: DbId,
    pub name: String,
    pub display_name: String,
    pub namespace: Option<String>,
    pub color: Option<String>,
    pub usage_count: i32,
    pub created_by: Option<DbId>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// Lightweight tag info returned when listing tags for an entity.
/// Avoids fetching audit columns that the caller does not need.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct TagInfo {
    pub id: DbId,
    pub name: String,
    pub display_name: String,
    pub namespace: Option<String>,
    pub color: Option<String>,
}

/// Tag suggestion returned by the autocomplete endpoint.
/// Includes `usage_count` so the UI can show popularity.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct TagSuggestion {
    pub id: DbId,
    pub name: String,
    pub display_name: String,
    pub namespace: Option<String>,
    pub color: Option<String>,
    pub usage_count: i32,
}

/// A row from the `entity_tags` junction table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct EntityTag {
    pub id: DbId,
    pub entity_type: String,
    pub entity_id: DbId,
    pub tag_id: DbId,
    pub applied_by: Option<DbId>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

// ---------------------------------------------------------------------------
// DTOs (request payloads)
// ---------------------------------------------------------------------------

/// DTO for creating a new tag via the `create_or_get` operation.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateTag {
    /// The tag name as typed by the user (original casing preserved as `display_name`).
    pub tag_name: String,
    /// Optional hex color code (e.g., `"#FF5733"`).
    pub color: Option<String>,
}

/// DTO for updating an existing tag. Only `color` and `display_name` are mutable.
#[derive(Debug, Clone, Deserialize)]
pub struct UpdateTag {
    pub display_name: Option<String>,
    pub color: Option<String>,
}

/// DTO for applying tags to an entity.
#[derive(Debug, Clone, Deserialize)]
pub struct ApplyTagsRequest {
    /// Tag names to apply. New tags are created on first use.
    pub tag_names: Vec<String>,
}

/// DTO for bulk-applying tags to multiple entities.
#[derive(Debug, Clone, Deserialize)]
pub struct BulkApplyRequest {
    pub entity_type: String,
    pub entity_ids: Vec<DbId>,
    pub tag_names: Vec<String>,
}

/// DTO for bulk-removing tags from multiple entities.
#[derive(Debug, Clone, Deserialize)]
pub struct BulkRemoveRequest {
    pub entity_type: String,
    pub entity_ids: Vec<DbId>,
    pub tag_ids: Vec<DbId>,
}

/// Result summary for bulk tag operations.
#[derive(Debug, Clone, Default, Serialize)]
pub struct BulkTagResult {
    pub applied: i64,
    pub removed: i64,
}

/// AND/OR logic for tag-based entity filtering.
#[derive(Debug, Clone, Copy, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum TagFilterLogic {
    #[default]
    Or,
    And,
}

/// Query parameters for `GET /api/v1/tags`.
#[derive(Debug, Clone, Deserialize)]
pub struct TagListParams {
    /// Filter by namespace (e.g., `"priority"`).
    pub namespace: Option<String>,
    /// Maximum results. Defaults to 100.
    pub limit: Option<i64>,
    /// Offset for pagination.
    pub offset: Option<i64>,
}

/// Query parameters for `GET /api/v1/tags/suggest`.
#[derive(Debug, Clone, Deserialize)]
pub struct TagSuggestParams {
    /// Prefix to match against normalized tag names.
    pub prefix: String,
    /// Maximum suggestions. Defaults to 10.
    pub limit: Option<i64>,
}

/// Query parameters for tag-based entity filtering.
#[derive(Debug, Clone, Deserialize)]
pub struct TagFilterParams {
    pub tag_ids: Vec<DbId>,
    #[serde(default)]
    pub logic: TagFilterLogic,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}
