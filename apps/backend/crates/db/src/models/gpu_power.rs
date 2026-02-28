//! GPU power management entity models and DTOs (PRD-87).

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};

// ---------------------------------------------------------------------------
// Entity structs (match database tables)
// ---------------------------------------------------------------------------

/// A row from the `power_schedules` table.
#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
pub struct PowerSchedule {
    pub id: DbId,
    pub worker_id: Option<DbId>,
    pub scope: String,
    pub schedule_json: serde_json::Value,
    pub timezone: String,
    pub override_for_queued_jobs: bool,
    pub enabled: bool,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// A row from the `power_consumption_log` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct PowerConsumptionLog {
    pub id: DbId,
    pub worker_id: DbId,
    pub date: chrono::NaiveDate,
    pub active_minutes: i32,
    pub idle_minutes: i32,
    pub off_minutes: i32,
    pub estimated_kwh: Option<f32>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

// ---------------------------------------------------------------------------
// Create / Update DTOs
// ---------------------------------------------------------------------------

/// DTO for creating a new power schedule.
#[derive(Debug, Clone, Deserialize)]
pub struct CreatePowerSchedule {
    pub worker_id: Option<DbId>,
    pub scope: Option<String>,
    pub schedule_json: serde_json::Value,
    pub timezone: Option<String>,
    pub override_for_queued_jobs: Option<bool>,
    pub enabled: Option<bool>,
}

/// DTO for updating an existing power schedule. All fields are optional.
#[derive(Debug, Clone, Deserialize)]
pub struct UpdatePowerSchedule {
    pub schedule_json: Option<serde_json::Value>,
    pub timezone: Option<String>,
    pub override_for_queued_jobs: Option<bool>,
    pub enabled: Option<bool>,
}

// ---------------------------------------------------------------------------
// Response DTOs
// ---------------------------------------------------------------------------

/// Fleet-wide power settings response.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FleetPowerSettings {
    pub default_idle_timeout_minutes: i32,
    pub default_wake_method: Option<String>,
    pub fleet_schedules: Vec<PowerSchedule>,
}

/// Worker power status for API responses.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct WorkerPowerStatus {
    pub worker_id: DbId,
    pub worker_name: String,
    pub power_state: String,
    pub idle_timeout_minutes: Option<i32>,
    pub wake_method: Option<String>,
    pub gpu_tdp_watts: Option<i32>,
    pub min_fleet_member: bool,
}

/// Aggregated consumption summary for a date range.
#[derive(Debug, Clone, Serialize)]
pub struct ConsumptionSummary {
    pub worker_id: Option<DbId>,
    pub total_active_minutes: i64,
    pub total_idle_minutes: i64,
    pub total_off_minutes: i64,
    pub total_estimated_kwh: f64,
    pub always_on_kwh: f64,
    pub savings_pct: f64,
    pub entries: Vec<PowerConsumptionLog>,
}
