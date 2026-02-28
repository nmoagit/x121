//! Budget & Quota Management models and DTOs (PRD-93).
//!
//! Defines the database row structs for `project_budgets`, `user_quotas`,
//! `budget_consumption_ledger`, and `budget_exemptions`, plus associated
//! create/update DTOs and response types.

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};

// ---------------------------------------------------------------------------
// ProjectBudget
// ---------------------------------------------------------------------------

/// A `project_budgets` row.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct ProjectBudget {
    pub id: DbId,
    pub project_id: DbId,
    pub budget_gpu_hours: f64,
    pub period_type: String,
    pub period_start: Timestamp,
    pub warning_threshold_pct: i32,
    pub critical_threshold_pct: i32,
    pub hard_limit_enabled: bool,
    pub rollover_enabled: bool,
    pub created_by: DbId,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// Input for creating / upserting a project budget.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateProjectBudget {
    pub budget_gpu_hours: f64,
    pub period_type: String,
    pub period_start: Option<Timestamp>,
    pub warning_threshold_pct: Option<i32>,
    pub critical_threshold_pct: Option<i32>,
    pub hard_limit_enabled: Option<bool>,
    pub rollover_enabled: Option<bool>,
}

/// Input for updating an existing project budget. All fields optional.
#[derive(Debug, Clone, Deserialize)]
pub struct UpdateProjectBudget {
    pub budget_gpu_hours: Option<f64>,
    pub period_type: Option<String>,
    pub period_start: Option<Timestamp>,
    pub warning_threshold_pct: Option<i32>,
    pub critical_threshold_pct: Option<i32>,
    pub hard_limit_enabled: Option<bool>,
    pub rollover_enabled: Option<bool>,
}

// ---------------------------------------------------------------------------
// UserQuota
// ---------------------------------------------------------------------------

/// A `user_quotas` row.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct UserQuota {
    pub id: DbId,
    pub user_id: DbId,
    pub quota_gpu_hours: f64,
    pub period_type: String,
    pub period_start: Timestamp,
    pub hard_limit_enabled: bool,
    pub created_by: DbId,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// Input for creating / upserting a user quota.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateUserQuota {
    pub quota_gpu_hours: f64,
    pub period_type: String,
    pub period_start: Option<Timestamp>,
    pub hard_limit_enabled: Option<bool>,
}

/// Input for updating an existing user quota. All fields optional.
#[derive(Debug, Clone, Deserialize)]
pub struct UpdateUserQuota {
    pub quota_gpu_hours: Option<f64>,
    pub period_type: Option<String>,
    pub period_start: Option<Timestamp>,
    pub hard_limit_enabled: Option<bool>,
}

// ---------------------------------------------------------------------------
// ConsumptionLedgerEntry
// ---------------------------------------------------------------------------

/// A `budget_consumption_ledger` row.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct ConsumptionLedgerEntry {
    pub id: DbId,
    pub project_id: DbId,
    pub user_id: DbId,
    pub job_id: Option<DbId>,
    pub gpu_hours: f64,
    pub job_type: String,
    pub resolution_tier: Option<String>,
    pub is_exempt: bool,
    pub exemption_reason: Option<String>,
    pub recorded_at: Timestamp,
}

/// Input for recording a new consumption entry.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateConsumptionEntry {
    pub project_id: DbId,
    pub user_id: DbId,
    pub job_id: Option<DbId>,
    pub gpu_hours: f64,
    pub job_type: String,
    pub resolution_tier: Option<String>,
    pub is_exempt: Option<bool>,
    pub exemption_reason: Option<String>,
}

// ---------------------------------------------------------------------------
// BudgetExemption
// ---------------------------------------------------------------------------

/// A `budget_exemptions` row.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct BudgetExemption {
    pub id: DbId,
    pub name: String,
    pub description: Option<String>,
    pub job_type: String,
    pub resolution_tier: Option<String>,
    pub is_enabled: bool,
    pub created_by: DbId,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// Input for creating a new budget exemption.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateBudgetExemption {
    pub name: String,
    pub description: Option<String>,
    pub job_type: String,
    pub resolution_tier: Option<String>,
}

/// Input for updating an existing budget exemption. All fields optional.
#[derive(Debug, Clone, Deserialize)]
pub struct UpdateBudgetExemption {
    pub name: Option<String>,
    pub description: Option<String>,
    pub job_type: Option<String>,
    pub resolution_tier: Option<String>,
    pub is_enabled: Option<bool>,
}

// ---------------------------------------------------------------------------
// Response DTOs
// ---------------------------------------------------------------------------

/// Budget status with consumption data and trend projection.
#[derive(Debug, Clone, Serialize)]
pub struct BudgetStatus {
    pub budget: ProjectBudget,
    pub consumed_gpu_hours: f64,
    pub remaining_gpu_hours: f64,
    pub consumed_pct: f64,
    pub trend: x121_core::budget_quota::TrendProjection,
}

/// Quota status with consumption data.
#[derive(Debug, Clone, Serialize)]
pub struct QuotaStatus {
    pub quota: UserQuota,
    pub consumed_gpu_hours: f64,
    pub remaining_gpu_hours: f64,
    pub consumed_pct: f64,
}

/// Daily aggregated consumption for historical views.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct DailyConsumption {
    pub day: chrono::NaiveDate,
    pub total_gpu_hours: f64,
}
