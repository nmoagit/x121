//! Keyframe models and DTOs (PRD-62).
//!
//! Defines the database row struct for `keyframes` and associated
//! create/filter types used by the repository and API layers.

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use trulience_core::types::{DbId, Timestamp};

// ---------------------------------------------------------------------------
// Entity
// ---------------------------------------------------------------------------

/// A keyframe row from the `keyframes` table.
#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
pub struct Keyframe {
    pub id: DbId,
    pub segment_id: DbId,
    pub frame_number: i32,
    pub timestamp_secs: f64,
    pub thumbnail_path: String,
    pub full_res_path: Option<String>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

// ---------------------------------------------------------------------------
// Create DTO (internal, used by repository)
// ---------------------------------------------------------------------------

/// Input for creating a new keyframe record.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateKeyframe {
    pub segment_id: DbId,
    pub frame_number: i32,
    pub timestamp_secs: f64,
    pub thumbnail_path: String,
    pub full_res_path: Option<String>,
}

// ---------------------------------------------------------------------------
// Filter DTO (query parameters)
// ---------------------------------------------------------------------------

/// Filter parameters for keyframe gallery queries.
#[derive(Debug, Clone, Deserialize)]
pub struct KeyframeFilter {
    pub segment_id: DbId,
    pub scene_id: Option<DbId>,
}
