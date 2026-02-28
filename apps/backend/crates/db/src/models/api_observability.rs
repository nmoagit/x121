//! API Observability entity models and DTOs (PRD-106).

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};

// ---------------------------------------------------------------------------
// api_metrics table
// ---------------------------------------------------------------------------

/// A row from the `api_metrics` table.
///
/// Time-bucketed API metrics with percentiles, error counts, and bandwidth.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct ApiMetric {
    pub id: DbId,
    pub period_start: Timestamp,
    pub period_granularity: String,
    pub endpoint: String,
    pub http_method: String,
    pub api_key_id: Option<DbId>,
    pub request_count: i32,
    pub error_count_4xx: i32,
    pub error_count_5xx: i32,
    pub response_time_p50_ms: Option<f32>,
    pub response_time_p95_ms: Option<f32>,
    pub response_time_p99_ms: Option<f32>,
    pub response_time_avg_ms: Option<f32>,
    pub total_request_bytes: i64,
    pub total_response_bytes: i64,
    pub created_at: Timestamp,
}

/// DTO for upserting an API metrics bucket.
#[derive(Debug, Deserialize)]
pub struct UpsertApiMetric {
    pub period_start: Timestamp,
    pub period_granularity: String,
    pub endpoint: String,
    pub http_method: String,
    pub api_key_id: Option<DbId>,
    pub request_count: i32,
    pub error_count_4xx: i32,
    pub error_count_5xx: i32,
    pub response_time_p50_ms: Option<f32>,
    pub response_time_p95_ms: Option<f32>,
    pub response_time_p99_ms: Option<f32>,
    pub response_time_avg_ms: Option<f32>,
    pub total_request_bytes: i64,
    pub total_response_bytes: i64,
}

// ---------------------------------------------------------------------------
// api_alert_configs table
// ---------------------------------------------------------------------------

/// A row from the `api_alert_configs` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct ApiAlertConfig {
    pub id: DbId,
    pub name: String,
    pub alert_type: String,
    pub endpoint_filter: Option<String>,
    pub api_key_filter: Option<DbId>,
    pub threshold_value: f32,
    pub comparison: String,
    pub window_minutes: i32,
    pub cooldown_minutes: i32,
    pub enabled: bool,
    pub last_fired_at: Option<Timestamp>,
    pub created_by: Option<DbId>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// DTO for creating a new alert configuration.
#[derive(Debug, Deserialize)]
pub struct CreateAlertConfig {
    pub name: String,
    pub alert_type: String,
    pub endpoint_filter: Option<String>,
    pub api_key_filter: Option<DbId>,
    pub threshold_value: f32,
    pub comparison: String,
    pub window_minutes: Option<i32>,
    pub cooldown_minutes: Option<i32>,
    pub enabled: Option<bool>,
}

/// DTO for updating an existing alert configuration. All fields optional.
#[derive(Debug, Deserialize)]
pub struct UpdateAlertConfig {
    pub name: Option<String>,
    pub alert_type: Option<String>,
    pub endpoint_filter: Option<String>,
    pub api_key_filter: Option<DbId>,
    pub threshold_value: Option<f32>,
    pub comparison: Option<String>,
    pub window_minutes: Option<i32>,
    pub cooldown_minutes: Option<i32>,
    pub enabled: Option<bool>,
}

// ---------------------------------------------------------------------------
// rate_limit_utilization table
// ---------------------------------------------------------------------------

/// A row from the `rate_limit_utilization` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct RateLimitUtilization {
    pub id: DbId,
    pub api_key_id: DbId,
    pub period_start: Timestamp,
    pub period_granularity: String,
    pub requests_made: i32,
    pub rate_limit: i32,
    pub utilization_pct: f32,
    pub created_at: Timestamp,
}

/// DTO for upserting a rate limit utilization record.
#[derive(Debug, Deserialize)]
pub struct UpsertRateLimitUtil {
    pub api_key_id: DbId,
    pub period_start: Timestamp,
    pub period_granularity: String,
    pub requests_made: i32,
    pub rate_limit: i32,
    pub utilization_pct: f32,
}

// ---------------------------------------------------------------------------
// API response types
// ---------------------------------------------------------------------------

/// High-level metrics summary for a time range.
#[derive(Debug, Clone, Serialize)]
pub struct MetricsSummary {
    pub total_requests: i64,
    pub error_rate: f64,
    pub avg_response_time: f64,
    pub top_endpoints: Vec<EndpointBreakdown>,
}

/// Per-API-key usage summary.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct TopConsumer {
    pub api_key_id: Option<DbId>,
    pub request_count: i64,
    pub error_rate: f64,
    pub total_bandwidth: i64,
}

/// Per-endpoint metrics breakdown.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct EndpointBreakdown {
    pub endpoint: String,
    pub http_method: String,
    pub request_count: i64,
    pub error_rate: f64,
    pub p50: f64,
    pub p95: f64,
    pub p99: f64,
}

/// Heatmap data row returned by the heatmap query.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct HeatmapRow {
    pub endpoint: String,
    pub time_bucket: Timestamp,
    pub request_count: i64,
}
