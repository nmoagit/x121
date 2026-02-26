//! Storage backend, asset location, tiering policy, and migration models (PRD-48).

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};

use crate::models::status::StatusId;

// ---------------------------------------------------------------------------
// Lookup table models
// ---------------------------------------------------------------------------

/// A row from `storage_backend_types`.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct StorageBackendTypeLookup {
    pub id: StatusId,
    pub name: String,
    pub label: String,
}

/// A row from `storage_backend_statuses`.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct StorageBackendStatusLookup {
    pub id: StatusId,
    pub name: String,
    pub label: String,
}

/// A row from `storage_migration_statuses`.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct StorageMigrationStatusLookup {
    pub id: StatusId,
    pub name: String,
    pub label: String,
}

// ---------------------------------------------------------------------------
// Storage backends
// ---------------------------------------------------------------------------

/// A row from the `storage_backends` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct StorageBackend {
    pub id: DbId,
    pub name: String,
    pub backend_type_id: StatusId,
    pub status_id: StatusId,
    pub tier: String,
    pub config: serde_json::Value,
    pub is_default: bool,
    pub total_capacity_bytes: Option<i64>,
    pub used_bytes: i64,
    pub project_id: Option<DbId>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// DTO for creating a storage backend.
#[derive(Debug, Deserialize)]
pub struct CreateStorageBackend {
    pub name: String,
    pub backend_type_id: StatusId,
    pub tier: Option<String>,
    pub config: serde_json::Value,
    pub is_default: Option<bool>,
    pub total_capacity_bytes: Option<i64>,
    pub project_id: Option<DbId>,
}

/// DTO for updating a storage backend.
#[derive(Debug, Deserialize)]
pub struct UpdateStorageBackend {
    pub name: Option<String>,
    pub tier: Option<String>,
    pub config: Option<serde_json::Value>,
    pub is_default: Option<bool>,
    pub total_capacity_bytes: Option<i64>,
    pub project_id: Option<DbId>,
}

// ---------------------------------------------------------------------------
// Asset locations
// ---------------------------------------------------------------------------

/// A row from the `asset_locations` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct AssetLocation {
    pub id: DbId,
    pub entity_type: String,
    pub entity_id: DbId,
    pub file_field: String,
    pub backend_id: DbId,
    pub storage_path: String,
    pub file_size_bytes: i64,
    pub checksum_sha256: Option<String>,
    pub last_accessed_at: Option<Timestamp>,
    pub access_count: i32,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// DTO for creating an asset location.
#[derive(Debug, Deserialize)]
pub struct CreateAssetLocation {
    pub entity_type: String,
    pub entity_id: DbId,
    pub file_field: Option<String>,
    pub backend_id: DbId,
    pub storage_path: String,
    pub file_size_bytes: Option<i64>,
    pub checksum_sha256: Option<String>,
}

// ---------------------------------------------------------------------------
// Tiering policies
// ---------------------------------------------------------------------------

/// A row from the `tiering_policies` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct TieringPolicy {
    pub id: DbId,
    pub name: String,
    pub description: Option<String>,
    pub source_tier: String,
    pub target_tier: String,
    pub target_backend_id: DbId,
    pub entity_type: String,
    pub condition_field: Option<String>,
    pub condition_operator: Option<String>,
    pub condition_value: Option<String>,
    pub age_threshold_days: Option<i32>,
    pub access_threshold_days: Option<i32>,
    pub project_id: Option<DbId>,
    pub is_active: bool,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// DTO for creating a tiering policy.
#[derive(Debug, Deserialize)]
pub struct CreateTieringPolicy {
    pub name: String,
    pub description: Option<String>,
    pub source_tier: String,
    pub target_tier: String,
    pub target_backend_id: DbId,
    pub entity_type: String,
    pub condition_field: Option<String>,
    pub condition_operator: Option<String>,
    pub condition_value: Option<String>,
    pub age_threshold_days: Option<i32>,
    pub access_threshold_days: Option<i32>,
    pub project_id: Option<DbId>,
    pub is_active: Option<bool>,
}

/// DTO for updating a tiering policy.
#[derive(Debug, Deserialize)]
pub struct UpdateTieringPolicy {
    pub name: Option<String>,
    pub description: Option<String>,
    pub source_tier: Option<String>,
    pub target_tier: Option<String>,
    pub target_backend_id: Option<DbId>,
    pub entity_type: Option<String>,
    pub condition_field: Option<String>,
    pub condition_operator: Option<String>,
    pub condition_value: Option<String>,
    pub age_threshold_days: Option<i32>,
    pub access_threshold_days: Option<i32>,
    pub project_id: Option<DbId>,
    pub is_active: Option<bool>,
}

/// Result DTO for tiering simulation: an asset that would be moved.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct TieringCandidate {
    pub entity_type: String,
    pub entity_id: DbId,
    pub file_field: String,
    pub file_size_bytes: i64,
    pub current_backend_id: DbId,
    pub last_accessed_at: Option<Timestamp>,
    pub access_count: i32,
}

// ---------------------------------------------------------------------------
// Storage migrations
// ---------------------------------------------------------------------------

/// A row from the `storage_migrations` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct StorageMigration {
    pub id: DbId,
    pub status_id: StatusId,
    pub source_backend_id: DbId,
    pub target_backend_id: DbId,
    pub total_files: i32,
    pub transferred_files: i32,
    pub verified_files: i32,
    pub failed_files: i32,
    pub total_bytes: i64,
    pub transferred_bytes: i64,
    pub error_log: serde_json::Value,
    pub started_at: Option<Timestamp>,
    pub completed_at: Option<Timestamp>,
    pub initiated_by: Option<DbId>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// DTO for creating a storage migration.
#[derive(Debug, Deserialize)]
pub struct CreateStorageMigration {
    pub source_backend_id: DbId,
    pub target_backend_id: DbId,
}
