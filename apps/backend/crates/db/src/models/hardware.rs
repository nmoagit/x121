//! Hardware monitoring entity models and DTOs (PRD-06).
//!
//! Models for GPU metrics, metric thresholds, and restart logs.

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};

// ---------------------------------------------------------------------------
// GPU metrics (append-only)
// ---------------------------------------------------------------------------

/// A single GPU metric snapshot recorded by a worker agent.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct GpuMetric {
    pub id: DbId,
    pub worker_id: DbId,
    pub gpu_index: i16,
    pub vram_used_mb: Option<i32>,
    pub vram_total_mb: Option<i32>,
    pub temperature_celsius: Option<i16>,
    pub utilization_percent: Option<i16>,
    pub power_draw_watts: Option<i16>,
    pub fan_speed_percent: Option<i16>,
    pub recorded_at: Timestamp,
    pub created_at: Timestamp,
}

/// DTO for inserting a new GPU metric row.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateGpuMetric {
    pub gpu_index: i16,
    pub vram_used_mb: Option<i32>,
    pub vram_total_mb: Option<i32>,
    pub temperature_celsius: Option<i16>,
    pub utilization_percent: Option<i16>,
    pub power_draw_watts: Option<i16>,
    pub fan_speed_percent: Option<i16>,
    pub recorded_at: Timestamp,
}

/// Aggregate view: latest metrics for a single worker GPU.
///
/// Returned by the "current metrics per worker" endpoint.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct WorkerCurrentMetrics {
    pub worker_id: DbId,
    pub gpu_index: i16,
    pub vram_used_mb: Option<i32>,
    pub vram_total_mb: Option<i32>,
    pub temperature_celsius: Option<i16>,
    pub utilization_percent: Option<i16>,
    pub power_draw_watts: Option<i16>,
    pub fan_speed_percent: Option<i16>,
    pub recorded_at: Timestamp,
}

// ---------------------------------------------------------------------------
// Metric thresholds
// ---------------------------------------------------------------------------

/// A threshold configuration for a metric on a specific worker (or global).
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct MetricThreshold {
    pub id: DbId,
    pub worker_id: Option<DbId>,
    pub metric_name: String,
    pub warning_value: i32,
    pub critical_value: i32,
    pub is_enabled: bool,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// DTO for upserting a metric threshold.
#[derive(Debug, Clone, Deserialize)]
pub struct UpsertThreshold {
    pub worker_id: Option<DbId>,
    pub metric_name: String,
    pub warning_value: i32,
    pub critical_value: i32,
}

// ---------------------------------------------------------------------------
// Restart logs
// ---------------------------------------------------------------------------

/// A restart status lookup entry.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct RestartStatus {
    pub id: i16,
    pub name: String,
    pub label: String,
}

/// A service restart log entry.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct RestartLog {
    pub id: DbId,
    pub worker_id: DbId,
    pub service_name: String,
    pub initiated_by: DbId,
    pub status_id: i16,
    pub reason: Option<String>,
    pub started_at: Timestamp,
    pub completed_at: Option<Timestamp>,
    pub error_message: Option<String>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// DTO for creating a restart log entry.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateRestartLog {
    pub worker_id: DbId,
    pub service_name: String,
    pub initiated_by: DbId,
    pub reason: Option<String>,
}
