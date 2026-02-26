//! Duplicate check models and DTOs (PRD-79).
//!
//! Maps to the `duplicate_checks` table introduced in migration 000087.

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};

use crate::models::status::StatusId;

// ---------------------------------------------------------------------------
// Entity
// ---------------------------------------------------------------------------

/// A row from the `duplicate_checks` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct DuplicateCheck {
    pub id: DbId,
    pub status_id: StatusId,
    pub source_character_id: DbId,
    pub matched_character_id: Option<DbId>,
    pub similarity_score: Option<f64>,
    pub threshold_used: f64,
    pub check_type: String,
    pub resolution: Option<String>,
    pub resolved_by: Option<DbId>,
    pub resolved_at: Option<Timestamp>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

// ---------------------------------------------------------------------------
// Create DTO
// ---------------------------------------------------------------------------

/// DTO for creating a new duplicate check record.
#[derive(Debug, Deserialize)]
pub struct CreateDuplicateCheck {
    pub source_character_id: DbId,
    pub matched_character_id: Option<DbId>,
    pub similarity_score: Option<f64>,
    pub threshold_used: f64,
    pub check_type: String,
    pub status_id: Option<StatusId>,
}

// ---------------------------------------------------------------------------
// Response types for API
// ---------------------------------------------------------------------------

/// Rich response DTO for a duplicate match (includes matched character name).
#[derive(Debug, Serialize)]
pub struct DuplicateMatchResponse {
    pub check_id: DbId,
    pub matched_character_id: DbId,
    pub matched_character_name: String,
    pub similarity_score: f64,
}

// ---------------------------------------------------------------------------
// Request types for API
// ---------------------------------------------------------------------------

/// Request body for resolving a duplicate check.
#[derive(Debug, Deserialize)]
pub struct ResolveCheckRequest {
    pub resolution: String,
    /// When resolution is "merge", the target character to merge into.
    pub target_character_id: Option<DbId>,
}

/// Request body for checking a single character for duplicates.
#[derive(Debug, Deserialize)]
pub struct CheckDuplicateRequest {
    pub character_id: DbId,
    pub project_id: Option<DbId>,
}

/// Request body for batch-checking multiple characters.
#[derive(Debug, Deserialize)]
pub struct BatchCheckRequest {
    pub character_ids: Vec<DbId>,
    pub project_id: Option<DbId>,
}
