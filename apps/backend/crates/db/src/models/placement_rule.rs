//! Placement rule entity model and DTOs (PRD-104).

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use trulience_core::types::{DbId, Timestamp};

/// A row from the `placement_rules` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct PlacementRule {
    pub id: DbId,
    pub model_type: String,
    pub base_model: Option<String>,
    pub target_directory: String,
    pub priority: i32,
    pub is_active: bool,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// DTO for creating a new placement rule.
#[derive(Debug, Clone, Deserialize)]
pub struct CreatePlacementRule {
    pub model_type: String,
    pub base_model: Option<String>,
    pub target_directory: String,
    pub priority: Option<i32>,
    pub is_active: Option<bool>,
}

/// DTO for updating a placement rule. All fields optional.
#[derive(Debug, Clone, Deserialize)]
pub struct UpdatePlacementRule {
    pub model_type: Option<String>,
    pub base_model: Option<String>,
    pub target_directory: Option<String>,
    pub priority: Option<i32>,
    pub is_active: Option<bool>,
}
