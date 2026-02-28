//! Batch review models and DTOs (PRD-92).
//!
//! Contains entity structs for `review_assignments` and `review_sessions`,
//! request DTOs for batch approve/reject/auto-approve, and response DTOs
//! for batch actions and review progress.

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};

// ---------------------------------------------------------------------------
// Review Assignment
// ---------------------------------------------------------------------------

/// A row from the `review_assignments` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct ReviewAssignment {
    pub id: DbId,
    pub project_id: DbId,
    pub reviewer_user_id: DbId,
    pub filter_criteria_json: serde_json::Value,
    pub deadline: Option<Timestamp>,
    pub status: String,
    pub assigned_by: DbId,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// DTO for creating a new review assignment.
#[derive(Debug, Deserialize)]
pub struct CreateAssignment {
    pub project_id: DbId,
    pub reviewer_user_id: DbId,
    pub filter_criteria_json: Option<serde_json::Value>,
    pub deadline: Option<String>,
}

/// DTO for updating an existing review assignment.
#[derive(Debug, Deserialize)]
pub struct UpdateAssignment {
    pub status: Option<String>,
    pub deadline: Option<String>,
    pub filter_criteria_json: Option<serde_json::Value>,
}

// ---------------------------------------------------------------------------
// Review Session
// ---------------------------------------------------------------------------

/// A row from the `review_sessions` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct ReviewSession {
    pub id: DbId,
    pub user_id: DbId,
    pub started_at: Timestamp,
    pub ended_at: Option<Timestamp>,
    pub segments_reviewed: i32,
    pub segments_approved: i32,
    pub segments_rejected: i32,
    pub avg_pace_seconds: Option<f32>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

// ---------------------------------------------------------------------------
// Batch action requests
// ---------------------------------------------------------------------------

/// Request body for batch-approving multiple segments at once.
#[derive(Debug, Deserialize)]
pub struct BatchApproveRequest {
    pub segment_ids: Vec<DbId>,
}

/// Request body for batch-rejecting multiple segments at once.
#[derive(Debug, Deserialize)]
pub struct BatchRejectRequest {
    pub segment_ids: Vec<DbId>,
    pub reason: Option<String>,
}

/// Request body for auto-approving segments above a QA threshold.
#[derive(Debug, Deserialize)]
pub struct AutoApproveRequest {
    pub project_id: DbId,
    pub threshold: f64,
}

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

/// Response for batch approve/reject/auto-approve operations.
#[derive(Debug, Serialize)]
pub struct BatchActionResponse {
    pub processed_count: i64,
    pub segment_ids: Vec<DbId>,
}

/// Review progress summary for a project.
#[derive(Debug, Serialize)]
pub struct ReviewProgressResponse {
    pub total_segments: i64,
    pub reviewed_segments: i64,
    pub approved_segments: i64,
    pub rejected_segments: i64,
    pub pending_segments: i64,
    pub avg_pace_seconds: Option<f32>,
    pub estimated_remaining_seconds: Option<f64>,
}
