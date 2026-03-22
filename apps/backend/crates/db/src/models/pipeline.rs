//! Pipeline entity model and DTOs (PRD-138).
//!
//! Pipelines define distinct video generation configurations, each with
//! their own seed-image slots, naming rules, and delivery settings.

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};

/// A row from the `pipelines` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct Pipeline {
    pub id: DbId,
    pub code: String,
    pub name: String,
    pub description: Option<String>,
    pub seed_slots: serde_json::Value,
    pub naming_rules: serde_json::Value,
    pub delivery_config: serde_json::Value,
    pub is_active: bool,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// DTO for creating a new pipeline.
#[derive(Debug, Clone, Deserialize)]
pub struct CreatePipeline {
    pub code: String,
    pub name: String,
    pub description: Option<String>,
    pub seed_slots: serde_json::Value,
    pub naming_rules: Option<serde_json::Value>,
    pub delivery_config: Option<serde_json::Value>,
}

/// DTO for updating an existing pipeline. All fields are optional.
#[derive(Debug, Clone, Deserialize)]
pub struct UpdatePipeline {
    pub name: Option<String>,
    pub description: Option<String>,
    pub seed_slots: Option<serde_json::Value>,
    pub naming_rules: Option<serde_json::Value>,
    pub delivery_config: Option<serde_json::Value>,
    pub is_active: Option<bool>,
}
