//! Performance metric entity models and DTOs (PRD-41).
//!
//! Models for per-job performance metrics and alert thresholds used by
//! the Performance & Benchmarking Dashboard.

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};

// ---------------------------------------------------------------------------
// Performance metrics (append-only)
// ---------------------------------------------------------------------------

/// A single performance metric snapshot recorded per generation job.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct PerformanceMetric {
    pub id: DbId,
    pub job_id: DbId,
    pub workflow_id: Option<DbId>,
    pub worker_id: Option<DbId>,
    pub project_id: Option<DbId>,
    pub character_id: Option<DbId>,
    pub scene_id: Option<DbId>,
    pub time_per_frame_ms: Option<f32>,
    pub total_gpu_time_ms: Option<i64>,
    pub total_wall_time_ms: Option<i64>,
    pub vram_peak_mb: Option<i32>,
    pub frame_count: Option<i32>,
    pub quality_scores_json: Option<serde_json::Value>,
    pub pipeline_stages_json: Option<serde_json::Value>,
    pub resolution_tier: Option<String>,
    pub created_at: Timestamp,
}

/// DTO for inserting a new performance metric.
#[derive(Debug, Clone, Deserialize)]
pub struct CreatePerformanceMetric {
    pub job_id: DbId,
    pub workflow_id: Option<DbId>,
    pub worker_id: Option<DbId>,
    pub project_id: Option<DbId>,
    pub character_id: Option<DbId>,
    pub scene_id: Option<DbId>,
    pub time_per_frame_ms: Option<f32>,
    pub total_gpu_time_ms: Option<i64>,
    pub total_wall_time_ms: Option<i64>,
    pub vram_peak_mb: Option<i32>,
    pub frame_count: Option<i32>,
    pub quality_scores_json: Option<serde_json::Value>,
    pub pipeline_stages_json: Option<serde_json::Value>,
    pub resolution_tier: Option<String>,
}

// ---------------------------------------------------------------------------
// Aggregated views (returned by aggregation queries)
// ---------------------------------------------------------------------------

/// Aggregated performance summary for a single workflow.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct WorkflowPerformanceSummary {
    pub workflow_id: Option<DbId>,
    pub avg_time_per_frame_ms: Option<f64>,
    pub p95_time_per_frame_ms: Option<f64>,
    pub avg_gpu_time_ms: Option<f64>,
    pub avg_vram_peak_mb: Option<f64>,
    pub max_vram_peak_mb: Option<i32>,
    pub avg_likeness_score: Option<f64>,
    pub job_count: i64,
    pub total_frames: Option<i64>,
}

/// Aggregated performance summary for a single worker.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct WorkerPerformanceSummary {
    pub worker_id: Option<DbId>,
    pub avg_time_per_frame_ms: Option<f64>,
    pub avg_gpu_time_ms: Option<f64>,
    pub avg_vram_peak_mb: Option<f64>,
    pub max_vram_peak_mb: Option<i32>,
    pub job_count: i64,
    pub total_gpu_time_ms: Option<i64>,
    pub total_wall_time_ms: Option<i64>,
}

/// A single time-series data point for trend charts.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct PerformanceTrendPoint {
    pub period: Timestamp,
    pub avg_time_per_frame_ms: Option<f64>,
    pub avg_gpu_time_ms: Option<f64>,
    pub avg_vram_peak_mb: Option<f64>,
    pub avg_likeness_score: Option<f64>,
    pub job_count: i64,
}

/// Dashboard overview summary.
#[derive(Debug, Clone, Serialize)]
pub struct PerformanceOverview {
    pub total_gpu_hours: f64,
    pub avg_time_per_frame_ms: f64,
    pub peak_vram_mb: i32,
    pub total_jobs: i64,
    pub total_frames: i64,
    pub top_workflows: Vec<WorkflowPerformanceSummary>,
    pub bottom_workflows: Vec<WorkflowPerformanceSummary>,
}

/// Workflow comparison result.
#[derive(Debug, Clone, Serialize)]
pub struct WorkflowComparison {
    pub summaries: Vec<WorkflowPerformanceSummary>,
}

// ---------------------------------------------------------------------------
// Performance alert thresholds
// ---------------------------------------------------------------------------

/// A configurable performance alert threshold.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct PerformanceAlertThreshold {
    pub id: DbId,
    pub metric_name: String,
    pub scope_type: String,
    pub scope_id: Option<DbId>,
    pub warning_threshold: f32,
    pub critical_threshold: f32,
    pub enabled: bool,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// DTO for creating a performance alert threshold.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateAlertThreshold {
    pub metric_name: String,
    pub scope_type: String,
    pub scope_id: Option<DbId>,
    pub warning_threshold: f32,
    pub critical_threshold: f32,
}

/// DTO for updating a performance alert threshold.
#[derive(Debug, Clone, Deserialize)]
pub struct UpdateAlertThreshold {
    pub metric_name: Option<String>,
    pub scope_type: Option<String>,
    pub scope_id: Option<DbId>,
    pub warning_threshold: Option<f32>,
    pub critical_threshold: Option<f32>,
    pub enabled: Option<bool>,
}
