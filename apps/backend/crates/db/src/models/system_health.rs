//! System health entity models and DTOs (PRD-80).

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};

// ---------------------------------------------------------------------------
// health_checks table
// ---------------------------------------------------------------------------

/// A row from the `health_checks` table.
///
/// Immutable time-series record of a single service health probe result.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct HealthCheck {
    pub id: DbId,
    pub service_name: String,
    pub status: String,
    pub latency_ms: Option<i32>,
    pub error_message: Option<String>,
    pub details_json: Option<serde_json::Value>,
    pub checked_at: Timestamp,
}

// ---------------------------------------------------------------------------
// uptime_records table
// ---------------------------------------------------------------------------

/// A row from the `uptime_records` table.
///
/// Tracks a contiguous period of a given status for a service.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct UptimeRecord {
    pub id: DbId,
    pub service_name: String,
    pub status: String,
    pub started_at: Timestamp,
    pub ended_at: Option<Timestamp>,
    pub duration_seconds: Option<i64>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

// ---------------------------------------------------------------------------
// health_alert_configs table
// ---------------------------------------------------------------------------

/// A row from the `health_alert_configs` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct HealthAlertConfig {
    pub id: DbId,
    pub service_name: String,
    pub escalation_delay_seconds: i32,
    pub webhook_url: Option<String>,
    pub notification_channels_json: Option<serde_json::Value>,
    pub enabled: bool,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// DTO for creating or updating an alert config via upsert.
#[derive(Debug, Deserialize)]
pub struct UpsertAlertConfig {
    pub escalation_delay_seconds: Option<i32>,
    pub webhook_url: Option<String>,
    pub notification_channels_json: Option<serde_json::Value>,
    pub enabled: Option<bool>,
}

// ---------------------------------------------------------------------------
// API response types
// ---------------------------------------------------------------------------

/// Latest status snapshot for a single service.
#[derive(Debug, Clone, Serialize)]
pub struct ServiceStatusResponse {
    pub service_name: String,
    pub status: String,
    pub latency_ms: Option<i32>,
    pub error_message: Option<String>,
    pub checked_at: Timestamp,
}

/// Detailed view for a single service including recent history.
#[derive(Debug, Serialize)]
pub struct ServiceDetailResponse {
    pub service_name: String,
    pub current_status: String,
    pub latency_ms: Option<i32>,
    pub error_message: Option<String>,
    pub checked_at: Timestamp,
    pub uptime_percent_24h: f64,
    pub recent_checks: Vec<HealthCheck>,
}

/// Per-service uptime percentages.
#[derive(Debug, Clone, Serialize)]
pub struct UptimeResponse {
    pub service_name: String,
    pub uptime_percent_24h: f64,
    pub healthy_seconds: i64,
    pub degraded_seconds: i64,
    pub down_seconds: i64,
    pub total_seconds: i64,
}
