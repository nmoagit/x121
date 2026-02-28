//! Time-based job scheduling entity models and DTOs (PRD-119).
//!
//! Covers: `schedules`, `schedule_history`, `off_peak_config`.

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};

// ---------------------------------------------------------------------------
// Schedule
// ---------------------------------------------------------------------------

/// A row from the `schedules` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct Schedule {
    pub id: DbId,
    pub name: String,
    pub description: Option<String>,
    pub schedule_type: String,
    pub cron_expression: Option<String>,
    pub scheduled_at: Option<Timestamp>,
    pub timezone: String,
    pub is_off_peak_only: bool,
    pub action_type: String,
    pub action_config: serde_json::Value,
    pub owner_id: DbId,
    pub is_active: bool,
    pub last_run_at: Option<Timestamp>,
    pub next_run_at: Option<Timestamp>,
    pub run_count: i32,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// DTO for creating a new schedule.
#[derive(Debug, Deserialize)]
pub struct CreateSchedule {
    pub name: String,
    pub description: Option<String>,
    pub schedule_type: String,
    pub cron_expression: Option<String>,
    pub scheduled_at: Option<Timestamp>,
    #[serde(default = "default_utc")]
    pub timezone: String,
    #[serde(default)]
    pub is_off_peak_only: bool,
    pub action_type: String,
    #[serde(default = "default_empty_object")]
    pub action_config: serde_json::Value,
}

/// DTO for updating an existing schedule.
#[derive(Debug, Deserialize)]
pub struct UpdateSchedule {
    pub name: Option<String>,
    pub description: Option<String>,
    pub schedule_type: Option<String>,
    pub cron_expression: Option<String>,
    pub scheduled_at: Option<Timestamp>,
    pub timezone: Option<String>,
    pub is_off_peak_only: Option<bool>,
    pub action_type: Option<String>,
    pub action_config: Option<serde_json::Value>,
}

/// Query parameters for listing schedules.
#[derive(Debug, Deserialize)]
pub struct ScheduleListParams {
    pub schedule_type: Option<String>,
    pub is_active: Option<bool>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

// ---------------------------------------------------------------------------
// Schedule History
// ---------------------------------------------------------------------------

/// A row from the `schedule_history` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct ScheduleHistory {
    pub id: DbId,
    pub schedule_id: DbId,
    pub executed_at: Timestamp,
    pub status: String,
    pub result_job_id: Option<DbId>,
    pub error_message: Option<String>,
    pub execution_duration_ms: Option<i32>,
    pub created_at: Timestamp,
}

/// Query parameters for listing schedule history.
#[derive(Debug, Deserialize)]
pub struct ScheduleHistoryParams {
    pub status: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

// ---------------------------------------------------------------------------
// Off-Peak Config
// ---------------------------------------------------------------------------

/// A row from the `off_peak_config` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct OffPeakConfig {
    pub id: DbId,
    pub day_of_week: i32,
    pub start_hour: i32,
    pub end_hour: i32,
    pub timezone: String,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// DTO for upserting an off-peak config entry.
#[derive(Debug, Deserialize)]
pub struct UpsertOffPeakConfig {
    pub day_of_week: i32,
    pub start_hour: i32,
    pub end_hour: i32,
    #[serde(default = "default_utc")]
    pub timezone: String,
}

/// DTO for bulk-updating the entire off-peak config.
#[derive(Debug, Deserialize)]
pub struct UpdateOffPeakConfigBulk {
    pub entries: Vec<UpsertOffPeakConfig>,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn default_utc() -> String {
    "UTC".to_string()
}

fn default_empty_object() -> serde_json::Value {
    serde_json::json!({})
}
