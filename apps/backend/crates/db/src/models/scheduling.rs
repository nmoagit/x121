//! Scheduling-related entity models (PRD-08).
//!
//! Covers scheduling policies, GPU quotas, and job state transitions.

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};

use super::status::StatusId;

// ---------------------------------------------------------------------------
// Scheduling policies
// ---------------------------------------------------------------------------

/// A row from the `scheduling_policies` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct SchedulingPolicy {
    pub id: DbId,
    pub name: String,
    pub policy_type: String,
    pub config: serde_json::Value,
    pub is_enabled: bool,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// DTO for creating/updating a scheduling policy.
#[derive(Debug, Deserialize)]
pub struct UpsertSchedulingPolicy {
    pub name: String,
    pub policy_type: String,
    pub config: serde_json::Value,
    #[serde(default = "default_true")]
    pub is_enabled: bool,
}

// ---------------------------------------------------------------------------
// GPU quotas
// ---------------------------------------------------------------------------

/// A row from the `gpu_quotas` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct GpuQuota {
    pub id: DbId,
    pub user_id: Option<DbId>,
    pub project_id: Option<DbId>,
    pub daily_limit_secs: Option<i32>,
    pub weekly_limit_secs: Option<i32>,
    pub is_enabled: bool,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// DTO for setting a user's GPU quota (admin action).
#[derive(Debug, Deserialize)]
pub struct SetGpuQuota {
    pub daily_limit_secs: Option<i32>,
    pub weekly_limit_secs: Option<i32>,
    #[serde(default = "default_true")]
    pub is_enabled: bool,
}

// ---------------------------------------------------------------------------
// Job state transitions (append-only log)
// ---------------------------------------------------------------------------

/// A row from the `job_state_transitions` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct JobStateTransition {
    pub id: DbId,
    pub job_id: DbId,
    pub from_status_id: StatusId,
    pub to_status_id: StatusId,
    pub triggered_by: Option<DbId>,
    pub reason: Option<String>,
    pub transitioned_at: Timestamp,
}

// ---------------------------------------------------------------------------
// Quota status (computed, not a DB row)
// ---------------------------------------------------------------------------

/// Result of a quota check for a user.
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "status")]
pub enum QuotaStatus {
    /// No quota configured — unlimited GPU time.
    #[serde(rename = "no_quota")]
    NoQuota,
    /// Within configured limits.
    #[serde(rename = "within_limits")]
    WithinLimits {
        used_today_secs: i64,
        daily_limit_secs: Option<i32>,
        used_this_week_secs: i64,
        weekly_limit_secs: Option<i32>,
    },
    /// Quota exceeded.
    #[serde(rename = "exceeded")]
    Exceeded {
        used_today_secs: i64,
        daily_limit_secs: Option<i32>,
        used_this_week_secs: i64,
        weekly_limit_secs: Option<i32>,
        exceeded_type: String,
    },
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn default_true() -> bool {
    true
}
