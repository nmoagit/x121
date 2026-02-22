//! Quality score models and DTOs (PRD-49).
//!
//! Maps to the `quality_scores` table introduced in migration 000081.

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use trulience_core::types::{DbId, Timestamp};

// ---------------------------------------------------------------------------
// Entity
// ---------------------------------------------------------------------------

/// A row from the `quality_scores` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct QualityScore {
    pub id: DbId,
    pub segment_id: DbId,
    pub check_type: String,
    pub score: f64,
    pub status: String,
    pub details: Option<serde_json::Value>,
    pub threshold_used: Option<f64>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

// ---------------------------------------------------------------------------
// Create DTO
// ---------------------------------------------------------------------------

/// DTO for inserting a new quality score.
#[derive(Debug, Deserialize)]
pub struct CreateQualityScore {
    pub segment_id: DbId,
    pub check_type: String,
    pub score: f64,
    pub status: String,
    pub details: Option<serde_json::Value>,
    pub threshold_used: Option<f64>,
}

// ---------------------------------------------------------------------------
// Summary DTOs
// ---------------------------------------------------------------------------

// NOTE: Per-segment QA summary (counts by status) is provided by
// `trulience_core::quality_gate::QaSummary`. Do not re-define here.

/// Per-scene QA summary (aggregated across all segments in the scene).
#[derive(Debug, Serialize)]
pub struct SceneQaSummary {
    pub scene_id: DbId,
    pub total_segments: usize,
    pub segments_with_failures: usize,
    pub segments_with_warnings: usize,
    pub all_passed: usize,
}
