//! Models for the folder-to-entity bulk importer (PRD-016).
//!
//! Covers import session tracking, per-file mapping entries, and DTOs
//! for session creation, preview, and commit results.

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};

// ── Import Session Status ────────────────────────────────────────────

/// A row from the `import_session_statuses` lookup table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct ImportSessionStatus {
    pub id: DbId,
    pub name: String,
    pub description: Option<String>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

// ── Import Sessions ──────────────────────────────────────────────────

/// A row from the `import_sessions` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct ImportSession {
    pub id: DbId,
    pub status_id: DbId,
    pub project_id: DbId,
    pub staging_path: String,
    pub source_name: String,
    pub total_files: i32,
    pub total_size_bytes: i64,
    pub mapped_entities: i32,
    pub validation_report_id: Option<DbId>,
    pub created_by: Option<DbId>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// DTO for creating a new import session.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateImportSession {
    pub project_id: DbId,
    pub staging_path: String,
    pub source_name: String,
    pub created_by: Option<DbId>,
}

// ── Import Mapping Entries ───────────────────────────────────────────

/// A row from the `import_mapping_entries` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct ImportMappingEntry {
    pub id: DbId,
    pub session_id: DbId,
    pub source_path: String,
    pub file_name: String,
    pub file_size_bytes: i64,
    pub file_extension: String,
    pub derived_entity_type: String,
    pub derived_entity_name: String,
    pub derived_category: Option<String>,
    pub target_entity_id: Option<DbId>,
    pub action: String,
    pub conflict_details: Option<serde_json::Value>,
    pub validation_errors: serde_json::Value,
    pub validation_warnings: serde_json::Value,
    pub is_selected: bool,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// DTO for inserting a mapping entry.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateImportMappingEntry {
    pub session_id: DbId,
    pub source_path: String,
    pub file_name: String,
    pub file_size_bytes: i64,
    pub file_extension: String,
    pub derived_entity_type: String,
    pub derived_entity_name: String,
    pub derived_category: Option<String>,
    pub target_entity_id: Option<DbId>,
    pub action: String,
    pub conflict_details: Option<serde_json::Value>,
    pub validation_errors: serde_json::Value,
    pub validation_warnings: serde_json::Value,
}

// ── Preview & Commit DTOs ────────────────────────────────────────────

/// Folder import preview returned to the client.
#[derive(Debug, Clone, Serialize)]
pub struct FolderImportPreview {
    pub session_id: DbId,
    pub total_files: usize,
    pub total_size_bytes: u64,
    pub entities_to_create: usize,
    pub entities_to_update: usize,
    pub uniqueness_conflicts: Vec<x121_core::importer::UniquenessConflict>,
    pub entries: Vec<ImportMappingEntry>,
}

/// Result of committing an import session.
#[derive(Debug, Clone, Default, Serialize)]
pub struct ImportCommitResult {
    pub created: usize,
    pub updated: usize,
    pub skipped: usize,
    pub failed: usize,
}
