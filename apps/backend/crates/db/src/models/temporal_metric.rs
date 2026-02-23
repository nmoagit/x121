//! Temporal metric and setting entity models and DTOs (PRD-26).
//!
//! Models for per-segment temporal continuity metrics (drift, centering,
//! grain) and per-project/scene-type threshold settings.

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use trulience_core::types::{DbId, Timestamp};

// ---------------------------------------------------------------------------
// TemporalMetric
// ---------------------------------------------------------------------------

/// A single temporal metric record for one segment.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct TemporalMetric {
    pub id: DbId,
    pub segment_id: DbId,
    pub drift_score: Option<f64>,
    pub centering_offset_x: Option<f64>,
    pub centering_offset_y: Option<f64>,
    pub grain_variance: Option<f64>,
    pub grain_match_score: Option<f64>,
    pub subject_bbox: Option<serde_json::Value>,
    pub analysis_version: String,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// DTO for creating a new temporal metric.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateTemporalMetric {
    pub segment_id: DbId,
    pub drift_score: Option<f64>,
    pub centering_offset_x: Option<f64>,
    pub centering_offset_y: Option<f64>,
    pub grain_variance: Option<f64>,
    pub grain_match_score: Option<f64>,
    pub subject_bbox: Option<serde_json::Value>,
    pub analysis_version: Option<String>,
}

// ---------------------------------------------------------------------------
// TemporalSetting
// ---------------------------------------------------------------------------

/// Per-project (optionally per-scene-type) temporal threshold settings.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct TemporalSetting {
    pub id: DbId,
    pub project_id: DbId,
    pub scene_type_id: Option<DbId>,
    pub drift_threshold: f64,
    pub grain_threshold: f64,
    pub centering_threshold: f64,
    pub auto_flag_enabled: bool,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// DTO for creating or upserting temporal settings.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateTemporalSetting {
    pub scene_type_id: Option<DbId>,
    pub drift_threshold: Option<f64>,
    pub grain_threshold: Option<f64>,
    pub centering_threshold: Option<f64>,
    pub auto_flag_enabled: Option<bool>,
}

// ---------------------------------------------------------------------------
// Trend data point (for chart rendering)
// ---------------------------------------------------------------------------

/// A single data point in a temporal metric trend series.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct TemporalTrendPoint {
    pub segment_id: DbId,
    pub drift_score: Option<f64>,
    pub centering_offset_x: Option<f64>,
    pub centering_offset_y: Option<f64>,
    pub grain_match_score: Option<f64>,
}
