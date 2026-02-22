//! QA threshold models and DTOs (PRD-49).
//!
//! Maps to the `qa_thresholds` table introduced in migration 000082.

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use trulience_core::types::{DbId, Timestamp};

// ---------------------------------------------------------------------------
// Entity
// ---------------------------------------------------------------------------

/// A row from the `qa_thresholds` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct QaThreshold {
    pub id: DbId,
    pub project_id: Option<DbId>,
    pub check_type: String,
    pub warn_threshold: f64,
    pub fail_threshold: f64,
    pub is_enabled: bool,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

// ---------------------------------------------------------------------------
// Create / Update DTOs
// ---------------------------------------------------------------------------

/// DTO for creating (or upserting) a threshold.
#[derive(Debug, Deserialize)]
pub struct CreateQaThreshold {
    pub check_type: String,
    pub warn_threshold: f64,
    pub fail_threshold: f64,
    pub is_enabled: Option<bool>,
}

/// DTO for patching an existing threshold.
#[derive(Debug, Deserialize)]
pub struct UpdateQaThreshold {
    pub warn_threshold: Option<f64>,
    pub fail_threshold: Option<f64>,
    pub is_enabled: Option<bool>,
}
