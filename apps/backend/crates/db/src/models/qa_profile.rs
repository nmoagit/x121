//! QA profile models and DTOs (PRD-91).
//!
//! Maps to the `qa_profiles` table introduced in migration 20260228000004.

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};

// ---------------------------------------------------------------------------
// Entity
// ---------------------------------------------------------------------------

/// A row from the `qa_profiles` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct QaProfile {
    pub id: DbId,
    pub name: String,
    pub description: Option<String>,
    pub thresholds: serde_json::Value,
    pub is_builtin: bool,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

// ---------------------------------------------------------------------------
// Create / Update DTOs
// ---------------------------------------------------------------------------

/// DTO for creating a new QA profile.
#[derive(Debug, Deserialize)]
pub struct CreateQaProfile {
    pub name: String,
    pub description: Option<String>,
    pub thresholds: serde_json::Value,
}

/// DTO for updating an existing QA profile. All fields are optional.
#[derive(Debug, Deserialize)]
pub struct UpdateQaProfile {
    pub name: Option<String>,
    pub description: Option<String>,
    pub thresholds: Option<serde_json::Value>,
}
