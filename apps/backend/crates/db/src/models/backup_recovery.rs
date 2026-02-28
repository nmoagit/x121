//! Backup & Disaster Recovery models and DTOs (PRD-81).
//!
//! Defines the database row structs for `backups` and `backup_schedules`,
//! plus associated create/update DTOs and the dashboard summary type.

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};

// ---------------------------------------------------------------------------
// Backup
// ---------------------------------------------------------------------------

/// A `backups` row.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct Backup {
    pub id: DbId,
    pub backup_type: String,
    pub destination: String,
    pub file_path: Option<String>,
    pub size_bytes: Option<i64>,
    pub status: String,
    pub started_at: Option<Timestamp>,
    pub completed_at: Option<Timestamp>,
    pub verified: bool,
    pub verified_at: Option<Timestamp>,
    pub verification_result_json: Option<serde_json::Value>,
    pub error_message: Option<String>,
    pub triggered_by: String,
    pub retention_expires_at: Option<Timestamp>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// Input for creating a new backup record.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateBackup {
    pub backup_type: String,
    pub destination: String,
    pub triggered_by: Option<String>,
}

/// Input for updating an existing backup record. All fields optional.
#[derive(Debug, Clone, Deserialize)]
pub struct UpdateBackup {
    pub status: Option<String>,
    pub file_path: Option<String>,
    pub size_bytes: Option<i64>,
    pub started_at: Option<Timestamp>,
    pub completed_at: Option<Timestamp>,
    pub error_message: Option<String>,
    pub verified: Option<bool>,
    pub verified_at: Option<Timestamp>,
    pub verification_result_json: Option<serde_json::Value>,
    pub retention_expires_at: Option<Timestamp>,
}

// ---------------------------------------------------------------------------
// BackupSchedule
// ---------------------------------------------------------------------------

/// A `backup_schedules` row.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct BackupSchedule {
    pub id: DbId,
    pub backup_type: String,
    pub cron_expression: String,
    pub destination: String,
    pub retention_days: i32,
    pub enabled: bool,
    pub last_run_at: Option<Timestamp>,
    pub next_run_at: Option<Timestamp>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// Input for creating a new backup schedule.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateBackupSchedule {
    pub backup_type: String,
    pub cron_expression: String,
    pub destination: String,
    pub retention_days: Option<i32>,
    pub enabled: Option<bool>,
}

/// Input for updating an existing backup schedule. All fields optional.
#[derive(Debug, Clone, Deserialize)]
pub struct UpdateBackupSchedule {
    pub backup_type: Option<String>,
    pub cron_expression: Option<String>,
    pub destination: Option<String>,
    pub retention_days: Option<i32>,
    pub enabled: Option<bool>,
}

// ---------------------------------------------------------------------------
// Summary DTO
// ---------------------------------------------------------------------------

/// Dashboard summary of backup state.
#[derive(Debug, Clone, Serialize)]
pub struct BackupSummary {
    /// Total number of backup records.
    pub total_count: i64,
    /// Total size of all backups in bytes.
    pub total_size_bytes: i64,
    /// Timestamp of the last completed full backup.
    pub last_full_at: Option<Timestamp>,
    /// Timestamp of the last verified backup.
    pub last_verified_at: Option<Timestamp>,
    /// Next scheduled backup run time.
    pub next_scheduled_at: Option<Timestamp>,
}
