//! Asset registry models and DTOs (PRD-17).

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};

// ---------------------------------------------------------------------------
// Entity structs (database rows)
// ---------------------------------------------------------------------------

/// A row from the `asset_types` lookup table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct AssetType {
    pub id: DbId,
    pub name: String,
    pub description: Option<String>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// A row from the `asset_statuses` lookup table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct AssetStatus {
    pub id: DbId,
    pub name: String,
    pub description: Option<String>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// A row from the `assets` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct Asset {
    pub id: DbId,
    pub name: String,
    pub version: String,
    pub asset_type_id: DbId,
    pub status_id: DbId,
    pub file_path: String,
    pub file_size_bytes: i64,
    pub checksum_sha256: String,
    pub description: Option<String>,
    pub metadata: serde_json::Value,
    pub registered_by: Option<DbId>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// Asset with aggregated stats for search/list results.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct AssetWithStats {
    pub id: DbId,
    pub name: String,
    pub version: String,
    pub asset_type_id: DbId,
    pub status_id: DbId,
    pub file_path: String,
    pub file_size_bytes: i64,
    pub checksum_sha256: String,
    pub description: Option<String>,
    pub metadata: serde_json::Value,
    pub registered_by: Option<DbId>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
    /// Average rating (0.0 if no ratings).
    pub avg_rating: f64,
    /// Total number of ratings.
    pub rating_count: i64,
    /// Number of dependency links referencing this asset.
    pub dependency_count: i64,
    /// Resolved asset type name (from JOIN).
    pub type_name: String,
    /// Resolved status name (from JOIN).
    pub status_name: String,
}

/// A row from the `asset_dependencies` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct AssetDependency {
    pub id: DbId,
    pub asset_id: DbId,
    pub dependent_entity_type: String,
    pub dependent_entity_id: DbId,
    pub dependency_role: String,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// A row from the `asset_notes` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct AssetNote {
    pub id: DbId,
    pub asset_id: DbId,
    pub related_asset_id: Option<DbId>,
    pub note_text: String,
    pub severity: String,
    pub author_id: Option<DbId>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// A row from the `asset_ratings` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct AssetRating {
    pub id: DbId,
    pub asset_id: DbId,
    pub rating: i16,
    pub review_text: Option<String>,
    pub reviewer_id: Option<DbId>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// Rating summary for a single asset.
#[derive(Debug, Clone, Serialize)]
pub struct RatingSummary {
    pub asset_id: DbId,
    pub avg_rating: f64,
    pub total_ratings: i64,
}

// ---------------------------------------------------------------------------
// DTOs (request payloads)
// ---------------------------------------------------------------------------

/// DTO for registering a new asset.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateAsset {
    pub name: String,
    pub version: String,
    pub asset_type_id: DbId,
    pub file_path: String,
    pub description: Option<String>,
    pub metadata: Option<serde_json::Value>,
}

/// DTO for updating an existing asset.
#[derive(Debug, Clone, Deserialize)]
pub struct UpdateAsset {
    pub name: Option<String>,
    pub version: Option<String>,
    pub status_id: Option<DbId>,
    pub description: Option<String>,
    pub metadata: Option<serde_json::Value>,
}

/// Query parameters for searching/listing assets.
#[derive(Debug, Clone, Deserialize)]
pub struct AssetSearchParams {
    /// Filter by name (ILIKE).
    pub name: Option<String>,
    /// Filter by asset type id.
    pub asset_type_id: Option<DbId>,
    /// Filter by status id.
    pub status_id: Option<DbId>,
    /// Maximum results (default 50, max 100).
    pub limit: Option<i64>,
    /// Offset for pagination.
    pub offset: Option<i64>,
}

/// DTO for adding a dependency link.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateDependency {
    pub dependent_entity_type: String,
    pub dependent_entity_id: DbId,
    pub dependency_role: Option<String>,
}

/// DTO for adding a compatibility note.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateNote {
    pub related_asset_id: Option<DbId>,
    pub note_text: String,
    pub severity: Option<String>,
}

/// DTO for rating an asset.
#[derive(Debug, Clone, Deserialize)]
pub struct RateAsset {
    pub rating: i16,
    pub review_text: Option<String>,
}
