//! Duplicate detection settings models and DTOs (PRD-79).
//!
//! Maps to the `duplicate_detection_settings` table introduced in migration 000088.

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use trulience_core::types::{DbId, Timestamp};

// ---------------------------------------------------------------------------
// Entity
// ---------------------------------------------------------------------------

/// A row from the `duplicate_detection_settings` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct DuplicateDetectionSetting {
    pub id: DbId,
    pub project_id: Option<DbId>,
    pub similarity_threshold: f64,
    pub auto_check_on_upload: bool,
    pub auto_check_on_batch: bool,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

// ---------------------------------------------------------------------------
// Update DTO
// ---------------------------------------------------------------------------

/// DTO for updating duplicate detection settings.
#[derive(Debug, Deserialize)]
pub struct UpdateDuplicateSetting {
    pub similarity_threshold: Option<f64>,
    pub auto_check_on_upload: Option<bool>,
    pub auto_check_on_batch: Option<bool>,
}
