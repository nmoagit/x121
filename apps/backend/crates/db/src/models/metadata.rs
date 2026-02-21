//! Metadata generation entity model and DTOs (PRD-13).

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use trulience_core::types::{DbId, Timestamp};

/// A row from the `metadata_generations` table.
///
/// Tracks when metadata JSON was last generated for a given entity,
/// enabling staleness detection and integrity verification.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct MetadataGeneration {
    pub id: DbId,
    pub entity_type: String,
    pub entity_id: DbId,
    pub file_type: String,
    pub file_path: String,
    pub generated_at: Timestamp,
    pub source_updated_at: Timestamp,
    pub schema_version: String,
    pub file_hash: String,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// DTO for creating / upserting a metadata generation record.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateMetadataGeneration {
    pub entity_type: String,
    pub entity_id: DbId,
    pub file_type: String,
    pub file_path: String,
    pub source_updated_at: Timestamp,
    pub schema_version: String,
    pub file_hash: String,
}

/// A stale metadata record detected by joining `metadata_generations`
/// against the source entity table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct StaleMetadata {
    pub entity_type: String,
    pub entity_id: DbId,
    pub file_type: String,
    pub generated_at: Timestamp,
    pub source_updated_at: Timestamp,
    pub current_entity_updated_at: Timestamp,
}

/// Summary report returned after a batch regeneration run.
#[derive(Debug, Clone, Default, Serialize)]
pub struct RegenerationReport {
    pub regenerated: i32,
    pub skipped: i32,
    pub failed: i32,
}
