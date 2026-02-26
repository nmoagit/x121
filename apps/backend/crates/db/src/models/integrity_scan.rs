//! Integrity scan models and DTOs (PRD-43).
//!
//! Maps to the `integrity_scans` table introduced in migration 000083.

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};

use super::status::StatusId;

// ---------------------------------------------------------------------------
// Entity
// ---------------------------------------------------------------------------

/// A row from the `integrity_scans` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct IntegrityScan {
    pub id: DbId,
    pub worker_id: DbId,
    pub scan_type: String,
    pub status_id: StatusId,
    pub results_json: Option<serde_json::Value>,
    pub models_found: i32,
    pub models_missing: i32,
    pub models_corrupted: i32,
    pub nodes_found: i32,
    pub nodes_missing: i32,
    pub started_at: Option<Timestamp>,
    pub completed_at: Option<Timestamp>,
    pub triggered_by: Option<DbId>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

// ---------------------------------------------------------------------------
// Create DTO
// ---------------------------------------------------------------------------

/// DTO for inserting a new integrity scan.
#[derive(Debug, Deserialize)]
pub struct CreateIntegrityScan {
    pub worker_id: DbId,
    pub scan_type: String,
    pub triggered_by: Option<DbId>,
}

// ---------------------------------------------------------------------------
// Update results DTO
// ---------------------------------------------------------------------------

/// DTO for updating scan results when a scan completes.
#[derive(Debug, Deserialize)]
pub struct UpdateIntegrityScanResults {
    pub results_json: Option<serde_json::Value>,
    pub models_found: i32,
    pub models_missing: i32,
    pub models_corrupted: i32,
    pub nodes_found: i32,
    pub nodes_missing: i32,
    pub completed_at: Option<Timestamp>,
}
