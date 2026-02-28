//! Retry attempt entity model and DTOs (PRD-71).

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};

/// A row from the `retry_attempts` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct RetryAttempt {
    pub id: DbId,
    pub segment_id: DbId,
    pub attempt_number: i32,
    pub seed: i64,
    pub parameters: serde_json::Value,
    pub original_parameters: serde_json::Value,
    pub output_video_path: Option<String>,
    pub quality_scores: Option<serde_json::Value>,
    pub overall_status: String,
    pub is_selected: bool,
    pub gpu_seconds: Option<f64>,
    pub failure_reason: Option<String>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// DTO for creating a new retry attempt.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateRetryAttempt {
    pub segment_id: DbId,
    pub attempt_number: i32,
    pub seed: i64,
    pub parameters: serde_json::Value,
    pub original_parameters: serde_json::Value,
}

/// DTO for updating an existing retry attempt.
#[derive(Debug, Clone, Deserialize)]
pub struct UpdateRetryAttempt {
    pub output_video_path: Option<String>,
    pub quality_scores: Option<serde_json::Value>,
    pub overall_status: Option<String>,
    pub is_selected: Option<bool>,
    pub gpu_seconds: Option<f64>,
    pub failure_reason: Option<String>,
}
