//! Activity log models (PRD-118).
//!
//! - `ActivityLog` — entity struct matching `activity_logs` row.
//! - `CreateActivityLog` — insert DTO for batch inserts.
//! - `ActivityLogQuery` — filter parameters for log queries.
//! - `ActivityLogSettings` — entity struct matching `activity_log_settings` singleton.
//! - `UpdateActivityLogSettings` — partial update DTO for settings.

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};

// ---------------------------------------------------------------------------
// ActivityLog
// ---------------------------------------------------------------------------

/// A single activity log entry from the `activity_logs` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct ActivityLog {
    pub id: DbId,
    pub timestamp: Timestamp,
    pub level_id: i16,
    pub source_id: i16,
    pub message: String,
    pub fields: serde_json::Value,
    pub category: String,
    pub entity_type: Option<String>,
    pub entity_id: Option<DbId>,
    pub user_id: Option<DbId>,
    pub job_id: Option<DbId>,
    pub project_id: Option<DbId>,
    pub trace_id: Option<String>,
    pub created_at: Timestamp,
}

/// DTO for inserting a new activity log entry (batch-friendly).
#[derive(Debug, Clone, Deserialize)]
pub struct CreateActivityLog {
    pub level_id: i16,
    pub source_id: i16,
    pub message: String,
    pub fields: serde_json::Value,
    pub category: String,
    pub entity_type: Option<String>,
    pub entity_id: Option<DbId>,
    pub user_id: Option<DbId>,
    pub job_id: Option<DbId>,
    pub project_id: Option<DbId>,
    pub trace_id: Option<String>,
}

/// Query parameters for filtering activity logs.
#[derive(Debug, Clone, Default, Deserialize)]
pub struct ActivityLogQuery {
    pub level: Option<String>,
    pub source: Option<String>,
    pub entity_type: Option<String>,
    pub entity_id: Option<DbId>,
    pub job_id: Option<DbId>,
    pub user_id: Option<DbId>,
    pub project_id: Option<DbId>,
    pub from: Option<Timestamp>,
    pub to: Option<Timestamp>,
    pub search: Option<String>,
    pub mode: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

/// Paginated response for activity log queries.
#[derive(Debug, Clone, Serialize)]
pub struct ActivityLogPage {
    pub items: Vec<ActivityLog>,
    pub total: i64,
}

// ---------------------------------------------------------------------------
// ActivityLogSettings
// ---------------------------------------------------------------------------

/// Activity log settings (singleton row, id=1).
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct ActivityLogSettings {
    pub id: DbId,
    pub retention_days_debug: i32,
    pub retention_days_info: i32,
    pub retention_days_warn: i32,
    pub retention_days_error: i32,
    pub batch_size: i32,
    pub flush_interval_ms: i32,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// DTO for updating activity log settings.
#[derive(Debug, Clone, Deserialize)]
pub struct UpdateActivityLogSettings {
    pub retention_days_debug: Option<i32>,
    pub retention_days_info: Option<i32>,
    pub retention_days_warn: Option<i32>,
    pub retention_days_error: Option<i32>,
    pub batch_size: Option<i32>,
    pub flush_interval_ms: Option<i32>,
}

// ---------------------------------------------------------------------------
// Lookup types
// ---------------------------------------------------------------------------

/// Row from the `activity_log_levels` lookup table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct ActivityLogLevelRow {
    pub id: i16,
    pub name: String,
    pub label: String,
}

/// Row from the `activity_log_sources` lookup table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct ActivityLogSourceRow {
    pub id: i16,
    pub name: String,
    pub label: String,
}
