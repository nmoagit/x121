//! Branch models and DTOs for Content Branching & Exploration (PRD-50).
//!
//! Defines the database row struct for `branches` and associated
//! create/update/response types used by the API layer.

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};

// ---------------------------------------------------------------------------
// Entity
// ---------------------------------------------------------------------------

/// A branch row from the `branches` table.
#[derive(Debug, Clone, Serialize, FromRow)]
pub struct Branch {
    pub id: DbId,
    pub scene_id: DbId,
    pub parent_branch_id: Option<DbId>,
    pub name: String,
    pub description: Option<String>,
    pub is_default: bool,
    pub depth: i32,
    pub parameters_snapshot: serde_json::Value,
    pub created_by_id: DbId,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

// ---------------------------------------------------------------------------
// Create DTO
// ---------------------------------------------------------------------------

/// Input for creating a new branch.
#[derive(Debug, Deserialize)]
pub struct CreateBranch {
    pub name: String,
    pub description: Option<String>,
    pub parameters_snapshot: serde_json::Value,
}

// ---------------------------------------------------------------------------
// Update DTO
// ---------------------------------------------------------------------------

/// Input for updating an existing branch (all fields optional).
#[derive(Debug, Deserialize)]
pub struct UpdateBranch {
    pub name: Option<String>,
    pub description: Option<String>,
    pub parameters_snapshot: Option<serde_json::Value>,
}

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

/// A branch enriched with aggregate statistics.
#[derive(Debug, Serialize)]
pub struct BranchWithStats {
    #[serde(flatten)]
    pub branch: Branch,
    pub segment_count: i64,
}

/// Request body for the promote-branch endpoint.
#[derive(Debug, Deserialize)]
pub struct PromoteRequest {
    pub branch_id: DbId,
}
