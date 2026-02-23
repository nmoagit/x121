//! Pattern fix models and DTOs (PRD-64).
//!
//! Maps to the `pattern_fixes` table introduced in migration 000021.

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use trulience_core::types::{DbId, Timestamp};

// ---------------------------------------------------------------------------
// Entity
// ---------------------------------------------------------------------------

/// A row from the `pattern_fixes` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct PatternFix {
    pub id: DbId,
    pub pattern_id: DbId,
    pub fix_description: String,
    pub fix_parameters: Option<serde_json::Value>,
    pub effectiveness: Option<String>,
    pub reported_by_id: DbId,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

// ---------------------------------------------------------------------------
// Create DTO
// ---------------------------------------------------------------------------

/// DTO for creating a new pattern fix.
#[derive(Debug, Deserialize)]
pub struct CreatePatternFix {
    pub fix_description: String,
    pub fix_parameters: Option<serde_json::Value>,
    pub effectiveness: Option<String>,
}
