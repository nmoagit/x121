//! Models for storage visualizer: file type categories and storage usage
//! snapshots (PRD-19).

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};

// ── File Type Categories ─────────────────────────────────────────────

/// A row from the `file_type_categories` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct FileTypeCategory {
    pub id: DbId,
    pub name: String,
    pub description: Option<String>,
    pub extensions: Vec<String>,
    pub color: Option<String>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// DTO for creating a file type category.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateFileTypeCategory {
    pub name: String,
    pub description: Option<String>,
    pub extensions: Vec<String>,
    pub color: Option<String>,
}

/// DTO for updating a file type category. All fields optional.
#[derive(Debug, Clone, Deserialize)]
pub struct UpdateFileTypeCategory {
    pub name: Option<String>,
    pub description: Option<String>,
    pub extensions: Option<Vec<String>>,
    pub color: Option<String>,
}

// ── Storage Usage Snapshots ──────────────────────────────────────────

/// A row from the `storage_usage_snapshots` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct StorageUsageSnapshot {
    pub id: DbId,
    pub entity_type: String,
    pub entity_id: DbId,
    pub entity_name: Option<String>,
    pub parent_entity_type: Option<String>,
    pub parent_entity_id: Option<DbId>,
    pub total_bytes: i64,
    pub file_count: i32,
    pub video_bytes: i64,
    pub image_bytes: i64,
    pub intermediate_bytes: i64,
    pub metadata_bytes: i64,
    pub model_bytes: i64,
    pub reclaimable_bytes: i64,
    pub snapshot_at: Timestamp,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// DTO for creating or upserting a storage usage snapshot.
#[derive(Debug, Clone, Deserialize)]
pub struct UpsertStorageSnapshot {
    pub entity_type: String,
    pub entity_id: DbId,
    pub entity_name: Option<String>,
    pub parent_entity_type: Option<String>,
    pub parent_entity_id: Option<DbId>,
    pub total_bytes: i64,
    pub file_count: i32,
    pub video_bytes: i64,
    pub image_bytes: i64,
    pub intermediate_bytes: i64,
    pub metadata_bytes: i64,
    pub model_bytes: i64,
    pub reclaimable_bytes: i64,
}

// ── Summary response ─────────────────────────────────────────────────

/// Aggregate storage summary across all snapshots.
#[derive(Debug, Clone, Serialize)]
pub struct StorageSummary {
    /// Total bytes across all snapshots.
    pub total_bytes: i64,
    /// Total file count across all snapshots.
    pub total_files: i32,
    /// Total reclaimable bytes.
    pub reclaimable_bytes: i64,
    /// Reclaimable percentage of total (0.0 to 1.0).
    pub reclaimable_percentage: f64,
    /// Number of entities tracked.
    pub entity_count: i64,
    /// Timestamp of the most recent snapshot (ISO 8601).
    pub snapshot_at: Option<Timestamp>,
}
