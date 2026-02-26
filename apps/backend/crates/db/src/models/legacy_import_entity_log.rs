//! Legacy import entity log model (PRD-86).

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};

/// A row from the `legacy_import_entity_log` table.
#[derive(Debug, Clone, Serialize, FromRow)]
pub struct LegacyImportEntityLog {
    pub id: DbId,
    pub run_id: DbId,
    pub entity_type: String,
    pub entity_id: Option<DbId>,
    pub source_path: String,
    pub action: String,
    pub details: serde_json::Value,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// DTO for creating a new entity log entry.
#[derive(Debug, Deserialize)]
pub struct CreateLegacyImportEntityLog {
    pub run_id: DbId,
    pub entity_type: String,
    pub entity_id: Option<DbId>,
    pub source_path: String,
    pub action: String,
    pub details: Option<serde_json::Value>,
}
