//! Generation metric entity models and DTOs (PRD-61).
//!
//! Stores per-workflow/resolution-tier averages for GPU time and disk usage,
//! used to power cost & resource estimation.

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};

// ---------------------------------------------------------------------------
// Entity
// ---------------------------------------------------------------------------

/// A calibration record storing running averages of GPU time and disk usage
/// for a specific (workflow, resolution_tier) pair.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct GenerationMetric {
    pub id: DbId,
    pub workflow_id: DbId,
    pub resolution_tier_id: DbId,
    pub avg_gpu_secs_per_segment: f64,
    pub avg_disk_mb_per_segment: f64,
    pub sample_count: i32,
    pub last_updated_at: Timestamp,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

// ---------------------------------------------------------------------------
// DTOs
// ---------------------------------------------------------------------------

/// DTO for recording a single metric observation after a generation completes.
#[derive(Debug, Clone, Deserialize)]
pub struct RecordMetricInput {
    pub workflow_id: DbId,
    pub resolution_tier_id: DbId,
    pub gpu_secs: f64,
    pub disk_mb: f64,
}

/// Request body for the estimation endpoint.
#[derive(Debug, Clone, Deserialize)]
pub struct EstimateRequest {
    pub scenes: Vec<SceneEstimateInput>,
    pub worker_count: Option<u32>,
}

/// Input for a single scene within an estimation request.
#[derive(Debug, Clone, Deserialize)]
pub struct SceneEstimateInput {
    pub workflow_id: DbId,
    pub resolution_tier_id: DbId,
    pub target_duration_secs: f64,
    pub segment_duration_secs: Option<f64>,
}
