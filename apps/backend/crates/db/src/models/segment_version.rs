//! Extended segment versioning types for re-stitching (PRD-25).
//!
//! The versioning columns live on the existing `segments` table (added via
//! migration 20260223000002). This module provides DTOs specific to the
//! re-stitching workflow rather than duplicating the full `Segment` model.

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};

/// Lightweight view of a segment's versioning state.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct SegmentVersionInfo {
    pub id: DbId,
    pub scene_id: DbId,
    pub sequence_index: i32,
    pub previous_segment_id: Option<DbId>,
    pub regeneration_count: i32,
    pub is_stale: bool,
    pub boundary_ssim_before: Option<f64>,
    pub boundary_ssim_after: Option<f64>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// Result of a boundary consistency check between adjacent segments.
#[derive(Debug, Clone, Serialize)]
pub struct BoundaryCheckResult {
    /// SSIM between the previous segment's last frame and this segment's first frame.
    pub before_ssim: Option<f64>,
    /// SSIM between this segment's last frame and the next segment's first frame.
    pub after_ssim: Option<f64>,
    /// Whether the "before" boundary needs smoothing.
    pub needs_smoothing_before: bool,
    /// Whether the "after" boundary needs smoothing.
    pub needs_smoothing_after: bool,
}

/// Request body for the regenerate endpoint.
#[derive(Debug, Clone, Deserialize)]
pub struct RegenerateRequest {
    /// Optional modified generation parameters (seed, CFG, etc.).
    pub modified_params: Option<serde_json::Value>,
}

/// Request body for the smooth-boundary endpoint.
#[derive(Debug, Clone, Deserialize)]
pub struct SmoothBoundaryRequest {
    /// Which boundary to smooth: "before" or "after".
    pub boundary: String,
    /// Smoothing method: "frame_blending", "re_extraction", or "manual_accept".
    pub method: String,
}

/// Boundary data for a segment, used by the repository to assemble a
/// [`BoundaryCheckResult`] from adjacent segments' frame paths and SSIM scores.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct SegmentBoundaryData {
    pub id: DbId,
    pub scene_id: DbId,
    pub sequence_index: i32,
    pub seed_frame_path: Option<String>,
    pub last_frame_path: Option<String>,
    pub boundary_ssim_before: Option<f64>,
    pub boundary_ssim_after: Option<f64>,
}
