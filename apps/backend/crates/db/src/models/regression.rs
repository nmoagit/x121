//! Regression testing models and DTOs (PRD-65).
//!
//! Defines database row structs for `regression_references`, `regression_runs`,
//! and `regression_results`, plus associated create DTOs and response types.

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::regression::RunSummary;
use x121_core::types::{DbId, Timestamp};

// ---------------------------------------------------------------------------
// Entities
// ---------------------------------------------------------------------------

/// A reference benchmark row from the `regression_references` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct RegressionReference {
    pub id: DbId,
    pub avatar_id: DbId,
    pub scene_type_id: DbId,
    pub reference_scene_id: DbId,
    pub baseline_scores: serde_json::Value,
    pub notes: Option<String>,
    pub created_by: DbId,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// A regression run row from the `regression_runs` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct RegressionRun {
    pub id: DbId,
    pub trigger_type: String,
    pub trigger_description: Option<String>,
    pub status: String,
    pub total_references: i32,
    pub completed_count: i32,
    pub passed_count: i32,
    pub failed_count: i32,
    pub started_at: Option<Timestamp>,
    pub completed_at: Option<Timestamp>,
    pub triggered_by: DbId,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// An individual result row from the `regression_results` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct RegressionResult {
    pub id: DbId,
    pub run_id: DbId,
    pub reference_id: DbId,
    pub new_scene_id: Option<DbId>,
    pub baseline_scores: serde_json::Value,
    pub new_scores: serde_json::Value,
    pub score_diffs: serde_json::Value,
    pub verdict: String,
    pub error_message: Option<String>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

// ---------------------------------------------------------------------------
// Create DTOs
// ---------------------------------------------------------------------------

/// Input for creating a new regression reference.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateRegressionReference {
    pub avatar_id: DbId,
    pub scene_type_id: DbId,
    pub reference_scene_id: DbId,
    pub baseline_scores: serde_json::Value,
    pub notes: Option<String>,
}

/// Input for triggering a new regression run.
#[derive(Debug, Clone, Deserialize)]
pub struct TriggerRegressionRun {
    pub trigger_type: String,
    pub trigger_description: Option<String>,
}

/// Input for recording a single regression result.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateRegressionResult {
    pub run_id: DbId,
    pub reference_id: DbId,
    pub new_scene_id: Option<DbId>,
    pub baseline_scores: serde_json::Value,
    pub new_scores: serde_json::Value,
    pub score_diffs: serde_json::Value,
    pub verdict: String,
    pub error_message: Option<String>,
}

// ---------------------------------------------------------------------------
// Response DTOs
// ---------------------------------------------------------------------------

/// Full report for a regression run, including all results and summary.
///
/// The summary uses [`RunSummary`] from `x121_core::regression` directly,
/// avoiding a redundant DTO.
#[derive(Debug, Clone, Serialize)]
pub struct RunReport {
    pub run: RegressionRun,
    pub results: Vec<RegressionResult>,
    pub summary: RunSummary,
}
