//! Legacy import run model (PRD-86).

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use trulience_core::types::{DbId, Timestamp};

/// A row from the `legacy_import_runs` table.
#[derive(Debug, Clone, Serialize, FromRow)]
pub struct LegacyImportRun {
    pub id: DbId,
    pub status_id: DbId,
    pub source_path: String,
    pub project_id: DbId,
    pub mapping_config: serde_json::Value,
    pub match_key: String,
    pub total_files: i32,
    pub characters_created: i32,
    pub characters_updated: i32,
    pub scenes_registered: i32,
    pub images_registered: i32,
    pub duplicates_found: i32,
    pub errors: i32,
    pub gap_report: serde_json::Value,
    pub initiated_by: Option<DbId>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// DTO for creating a new legacy import run.
#[derive(Debug, Deserialize)]
pub struct CreateLegacyImportRun {
    pub source_path: String,
    pub project_id: DbId,
    pub mapping_config: Option<serde_json::Value>,
    pub match_key: Option<String>,
}

/// DTO for updating a legacy import run.
#[derive(Debug, Deserialize)]
pub struct UpdateLegacyImportRun {
    pub mapping_config: Option<serde_json::Value>,
    pub match_key: Option<String>,
}

/// A row from the `legacy_import_run_statuses` lookup table.
#[derive(Debug, Clone, Serialize, FromRow)]
pub struct LegacyImportRunStatus {
    pub id: DbId,
    pub name: String,
    pub label: String,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}
