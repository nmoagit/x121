//! Segment approval and rejection category models (PRD-35).

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};

/// A row from the `segment_approvals` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct SegmentApproval {
    pub id: DbId,
    pub segment_id: DbId,
    pub user_id: DbId,
    pub decision: String,
    pub reason_category_id: Option<DbId>,
    pub comment: Option<String>,
    pub segment_version: i32,
    pub decided_at: Timestamp,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// A row from the `rejection_categories` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct RejectionCategory {
    pub id: DbId,
    pub name: String,
    pub description: Option<String>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// DTO for creating a new segment approval decision.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateApproval {
    pub segment_id: DbId,
    pub user_id: DbId,
    pub decision: String,
    pub reason_category_id: Option<DbId>,
    pub comment: Option<String>,
    pub segment_version: i32,
}

/// Request body for the approve endpoint.
#[derive(Debug, Clone, Deserialize)]
pub struct ApproveRequest {
    pub segment_version: i32,
}

/// Request body for the reject endpoint.
#[derive(Debug, Clone, Deserialize)]
pub struct RejectRequest {
    pub reason_category_id: Option<DbId>,
    pub comment: Option<String>,
    pub segment_version: i32,
}

/// Request body for the flag endpoint.
#[derive(Debug, Clone, Deserialize)]
pub struct FlagRequest {
    pub comment: Option<String>,
    pub segment_version: i32,
}

/// A review queue item combining segment info with approval status.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct ReviewQueueItem {
    pub segment_id: DbId,
    pub scene_id: DbId,
    pub sequence_index: i32,
    pub status_id: i16,
    pub has_approval: bool,
}
