//! Failure pattern models and DTOs (PRD-64).
//!
//! Maps to the `failure_patterns` table introduced in migration 000020.

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use trulience_core::types::{DbId, Timestamp};

// ---------------------------------------------------------------------------
// Entity
// ---------------------------------------------------------------------------

/// A row from the `failure_patterns` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct FailurePattern {
    pub id: DbId,
    pub pattern_key: String,
    pub description: Option<String>,
    pub dimension_workflow_id: Option<DbId>,
    pub dimension_lora_id: Option<DbId>,
    pub dimension_character_id: Option<DbId>,
    pub dimension_scene_type_id: Option<DbId>,
    pub dimension_segment_position: Option<String>,
    pub failure_count: i32,
    pub total_count: i32,
    pub failure_rate: f64,
    pub severity: String,
    pub last_occurrence: Option<Timestamp>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

// ---------------------------------------------------------------------------
// Upsert DTO
// ---------------------------------------------------------------------------

/// DTO for upserting a failure pattern.
#[derive(Debug, Deserialize)]
pub struct UpsertFailurePattern {
    pub pattern_key: String,
    pub description: Option<String>,
    pub dimension_workflow_id: Option<DbId>,
    pub dimension_lora_id: Option<DbId>,
    pub dimension_character_id: Option<DbId>,
    pub dimension_scene_type_id: Option<DbId>,
    pub dimension_segment_position: Option<String>,
    pub failure_count: i32,
    pub total_count: i32,
    pub failure_rate: f64,
    pub severity: String,
}

// ---------------------------------------------------------------------------
// Heatmap response DTOs
// ---------------------------------------------------------------------------

/// Heatmap data payload returned by the heatmap API endpoint.
#[derive(Debug, Serialize)]
pub struct HeatmapData {
    pub cells: Vec<HeatmapCellResponse>,
    pub row_labels: Vec<String>,
    pub col_labels: Vec<String>,
}

/// A single cell in the heatmap response.
#[derive(Debug, Serialize)]
pub struct HeatmapCellResponse {
    pub row: String,
    pub col: String,
    pub failure_rate: f64,
    pub sample_count: i32,
    pub severity: String,
}

// ---------------------------------------------------------------------------
// Trend response DTOs
// ---------------------------------------------------------------------------

/// A single data point in a failure trend time series response.
#[derive(Debug, Serialize)]
pub struct TrendPointResponse {
    pub period: String,
    pub failure_rate: f64,
    pub sample_count: i32,
}
