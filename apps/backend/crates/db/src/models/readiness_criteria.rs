//! Readiness criteria model (PRD-107).

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};

/// A row from the `readiness_criteria` table.
#[derive(Debug, Clone, Serialize, FromRow)]
pub struct ReadinessCriteria {
    pub id: DbId,
    pub scope_type: String,
    pub scope_id: Option<DbId>,
    pub criteria_json: serde_json::Value,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// DTO for creating a new readiness criteria row.
#[derive(Debug, Deserialize)]
pub struct CreateReadinessCriteria {
    pub scope_type: String,
    pub scope_id: Option<DbId>,
    pub criteria_json: serde_json::Value,
}

/// DTO for updating a readiness criteria row.
#[derive(Debug, Deserialize)]
pub struct UpdateReadinessCriteria {
    pub criteria_json: Option<serde_json::Value>,
}
