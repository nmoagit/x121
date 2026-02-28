//! Consistency report models and DTOs (PRD-94).

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};

/// A row from the `consistency_reports` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct ConsistencyReport {
    pub id: DbId,
    pub character_id: DbId,
    pub project_id: DbId,
    pub scores_json: serde_json::Value,
    pub overall_consistency_score: Option<f64>,
    pub outlier_scene_ids: Option<Vec<DbId>>,
    pub report_type: String,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// DTO for creating a new consistency report.
#[derive(Debug, Deserialize)]
pub struct CreateConsistencyReport {
    pub character_id: DbId,
    pub project_id: DbId,
    pub scores_json: serde_json::Value,
    pub overall_consistency_score: Option<f64>,
    pub outlier_scene_ids: Option<Vec<DbId>>,
    pub report_type: String,
}
