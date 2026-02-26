//! Segment trim models and DTOs (PRD-78).
//!
//! Defines the database row struct for `segment_trims` and associated
//! create/request/response types used by the API layer.

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};

// ---------------------------------------------------------------------------
// Entity
// ---------------------------------------------------------------------------

/// A segment trim row from the `segment_trims` table.
#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
pub struct SegmentTrim {
    pub id: DbId,
    pub segment_id: DbId,
    pub original_path: String,
    pub trimmed_path: Option<String>,
    pub in_frame: i32,
    pub out_frame: i32,
    pub total_original_frames: i32,
    pub created_by: DbId,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

// ---------------------------------------------------------------------------
// Create DTO (internal, used by repository)
// ---------------------------------------------------------------------------

/// Input for creating a new segment trim record.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateSegmentTrim {
    pub segment_id: DbId,
    pub original_path: String,
    pub in_frame: i32,
    pub out_frame: i32,
    pub total_original_frames: i32,
    pub created_by: DbId,
}

// ---------------------------------------------------------------------------
// API request types
// ---------------------------------------------------------------------------

/// Request body for applying a trim to multiple segments at once.
#[derive(Debug, Clone, Deserialize)]
pub struct BatchTrimRequest {
    pub segment_ids: Vec<DbId>,
    pub in_frame: i32,
    pub out_frame: i32,
}

/// Request body for applying a quick trim preset to a segment.
#[derive(Debug, Clone, Deserialize)]
pub struct ApplyPresetRequest {
    pub segment_id: DbId,
    pub preset: String,
    pub total_frames: i32,
}

// ---------------------------------------------------------------------------
// API response types
// ---------------------------------------------------------------------------

/// Response returned after a batch trim operation.
#[derive(Debug, Clone, Serialize)]
pub struct BatchTrimResponse {
    pub trim_ids: Vec<DbId>,
    pub count: usize,
}

/// Response describing the seed frame impact of a trim on downstream segments.
#[derive(Debug, Clone, Serialize)]
pub struct SeedFrameUpdate {
    pub segment_id: DbId,
    pub new_seed_frame: i32,
    pub downstream_segment_id: Option<DbId>,
    pub downstream_invalidated: bool,
}
