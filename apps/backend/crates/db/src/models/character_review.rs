//! Character review allocation models and DTOs (PRD-129).
//!
//! Contains entity structs for `character_review_assignments`,
//! `character_review_decisions`, and `character_review_audit_log`,
//! plus request/response DTOs for the review allocation workflow.

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};

// ---------------------------------------------------------------------------
// Status lookup
// ---------------------------------------------------------------------------

/// A row from the `character_review_statuses` lookup table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct CharacterReviewStatus {
    pub id: i16,
    pub name: String,
    pub label: String,
}

// ---------------------------------------------------------------------------
// Assignment entity
// ---------------------------------------------------------------------------

/// A row from the `character_review_assignments` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct CharacterReviewAssignment {
    pub id: DbId,
    pub character_id: DbId,
    pub reviewer_user_id: DbId,
    pub assigned_by: DbId,
    pub reassigned_from: Option<DbId>,
    pub review_round: i32,
    pub status: String,
    pub started_at: Option<Timestamp>,
    pub completed_at: Option<Timestamp>,
    pub deadline: Option<Timestamp>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

// ---------------------------------------------------------------------------
// Decision entity
// ---------------------------------------------------------------------------

/// A row from the `character_review_decisions` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct CharacterReviewDecision {
    pub id: DbId,
    pub assignment_id: DbId,
    pub character_id: DbId,
    pub reviewer_user_id: DbId,
    pub decision: String,
    pub comment: Option<String>,
    pub review_round: i32,
    pub review_duration_sec: Option<i32>,
    pub decided_at: Timestamp,
    pub created_at: Timestamp,
}

// ---------------------------------------------------------------------------
// Audit log entity
// ---------------------------------------------------------------------------

/// A row from the `character_review_audit_log` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct CharacterReviewAuditEntry {
    pub id: DbId,
    pub character_id: DbId,
    pub action: String,
    pub actor_user_id: DbId,
    pub target_user_id: Option<DbId>,
    pub comment: Option<String>,
    pub metadata: serde_json::Value,
    pub created_at: Timestamp,
}

// ---------------------------------------------------------------------------
// Joined view structs
// ---------------------------------------------------------------------------

/// A character in the reviewer's queue, enriched with project context.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct ReviewQueueCharacter {
    pub assignment_id: DbId,
    pub character_id: DbId,
    pub character_name: String,
    pub project_id: DbId,
    pub project_name: String,
    pub review_round: i32,
    pub scene_count: i64,
    pub assigned_at: Timestamp,
    pub deadline: Option<Timestamp>,
    pub status: String,
}

/// Workload summary for a single reviewer within a project.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct ReviewerWorkload {
    pub reviewer_user_id: DbId,
    pub reviewer_username: String,
    pub assigned_count: i64,
    pub in_review_count: i64,
    pub completed_count: i64,
    pub approved_count: i64,
    pub rejected_count: i64,
}

// ---------------------------------------------------------------------------
// Request DTOs
// ---------------------------------------------------------------------------

/// Request body for creating one or more character review assignments.
#[derive(Debug, Deserialize)]
pub struct CreateCharacterAssignment {
    pub character_ids: Vec<DbId>,
    pub reviewer_user_id: DbId,
    pub deadline: Option<String>,
}

/// Request body for reassigning a character review to another reviewer.
#[derive(Debug, Deserialize)]
pub struct ReassignCharacterReview {
    pub new_reviewer_user_id: DbId,
}

/// Request body for submitting a review decision (approve or reject).
#[derive(Debug, Deserialize)]
pub struct ReviewDecisionRequest {
    pub decision: String,
    pub comment: Option<String>,
}

/// Request body for auto-allocating unassigned characters to reviewers.
#[derive(Debug, Deserialize)]
pub struct AutoAllocateRequest {
    pub exclude_reviewer_ids: Option<Vec<DbId>>,
}

/// Filter parameters for querying the character review audit log.
#[derive(Debug, Deserialize)]
pub struct AuditLogFilterParams {
    pub reviewer_user_id: Option<DbId>,
    pub action: Option<String>,
    pub from_date: Option<String>,
    pub to_date: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

// ---------------------------------------------------------------------------
// Response DTOs
// ---------------------------------------------------------------------------

/// Preview of auto-allocation results before confirmation.
#[derive(Debug, Serialize)]
pub struct AutoAllocatePreview {
    pub proposed_assignments: Vec<ProposedAssignment>,
    pub unassigned_count: i64,
    pub reviewer_count: i64,
}

/// A single proposed assignment from auto-allocation.
#[derive(Debug, Clone, Serialize)]
pub struct ProposedAssignment {
    pub character_id: DbId,
    pub character_name: String,
    pub reviewer_user_id: DbId,
    pub reviewer_username: String,
}
