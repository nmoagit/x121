//! Generation-specific DTOs (PRD-24).
//!
//! These are purpose-built update structs for the generation loop, kept
//! separate from the entity-level Create/Update DTOs so that regular CRUD
//! handlers stay small and focused.

use serde::{Deserialize, Serialize};
use trulience_core::types::{DbId, Timestamp};

// ---------------------------------------------------------------------------
// Segment generation update
// ---------------------------------------------------------------------------

/// Fields that the generation loop updates on a segment.
#[derive(Debug, Clone, Deserialize)]
pub struct UpdateSegmentGeneration {
    pub duration_secs: Option<f64>,
    pub cumulative_duration_secs: Option<f64>,
    pub boundary_frame_index: Option<i32>,
    pub boundary_selection_mode: Option<String>,
    pub generation_started_at: Option<Timestamp>,
    pub generation_completed_at: Option<Timestamp>,
    pub worker_id: Option<DbId>,
    pub prompt_type: Option<String>,
    pub prompt_text: Option<String>,
    pub seed_frame_path: Option<String>,
    pub last_frame_path: Option<String>,
    pub output_video_path: Option<String>,
}

// ---------------------------------------------------------------------------
// Scene generation update
// ---------------------------------------------------------------------------

/// Fields that the generation loop updates on a scene.
#[derive(Debug, Clone, Deserialize)]
pub struct UpdateSceneGeneration {
    pub total_segments_estimated: Option<i32>,
    pub total_segments_completed: Option<i32>,
    pub actual_duration_secs: Option<f64>,
    pub transition_segment_index: Option<i32>,
    pub generation_started_at: Option<Timestamp>,
    pub generation_completed_at: Option<Timestamp>,
}

// ---------------------------------------------------------------------------
// Progress reporting
// ---------------------------------------------------------------------------

/// Real-time progress snapshot returned by the progress endpoint.
#[derive(Debug, Clone, Serialize)]
pub struct GenerationProgress {
    pub scene_id: DbId,
    pub segments_completed: i32,
    pub segments_estimated: Option<i32>,
    pub cumulative_duration: f64,
    pub target_duration: Option<f64>,
    pub elapsed_secs: f64,
    pub estimated_remaining_secs: Option<f64>,
}

// ---------------------------------------------------------------------------
// Request DTOs
// ---------------------------------------------------------------------------

/// Body for `POST /scenes/{id}/generate`.
#[derive(Debug, Clone, Deserialize)]
pub struct StartGenerationRequest {
    pub boundary_mode: Option<String>,
}

/// Body for `POST /scenes/batch-generate`.
#[derive(Debug, Clone, Deserialize)]
pub struct BatchGenerateRequest {
    pub scene_ids: Vec<DbId>,
}

/// Body for `POST /segments/{id}/select-boundary-frame`.
#[derive(Debug, Clone, Deserialize)]
pub struct SelectBoundaryFrameRequest {
    pub frame_index: i32,
}

// ---------------------------------------------------------------------------
// Response DTOs
// ---------------------------------------------------------------------------

/// Response for `POST /scenes/{id}/generate`.
#[derive(Debug, Clone, Serialize)]
pub struct StartGenerationResponse {
    pub scene_id: DbId,
    pub status: String,
    pub total_segments_estimated: u32,
    pub boundary_mode: String,
}

/// Response for `POST /segments/{id}/select-boundary-frame`.
#[derive(Debug, Clone, Serialize)]
pub struct SelectBoundaryFrameResponse {
    pub segment_id: DbId,
    pub boundary_frame_index: i32,
    pub boundary_selection_mode: String,
}

/// Response for `POST /scenes/batch-generate`.
#[derive(Debug, Clone, Serialize)]
pub struct BatchGenerateResponse {
    pub started: Vec<DbId>,
    pub errors: Vec<BatchGenerateError>,
}

/// A single error entry in a batch generate response.
#[derive(Debug, Clone, Serialize)]
pub struct BatchGenerateError {
    pub scene_id: DbId,
    pub error: String,
}
