//! Handlers for incremental re-stitching & boundary smoothing (PRD-25).
//!
//! Provides endpoints for regenerating individual segments, checking boundary
//! consistency (SSIM), applying boundary smoothing, listing segment versions,
//! and clearing stale flags.

use axum::extract::{Path, State};
use axum::response::IntoResponse;
use axum::Json;
use serde::Serialize;
use x121_core::restitching;
use x121_core::types::DbId;
use x121_db::models::segment_version::{
    BoundaryCheckResult, RegenerateRequest, SmoothBoundaryRequest,
};
use x121_db::repositories::{SegmentRepo, SegmentVersionRepo};

use crate::error::AppResult;
use crate::handlers::segment::ensure_segment_exists;
use crate::middleware::auth::AuthUser;
use crate::response::DataResponse;
use crate::state::AppState;

// ---------------------------------------------------------------------------
// Response DTOs
// ---------------------------------------------------------------------------

/// Response for the regenerate endpoint.
#[derive(Debug, Serialize)]
struct RegenerateResponse {
    /// The ID of the newly created segment.
    new_segment_id: DbId,
    /// Number of downstream segments flagged as stale.
    stale_count: u64,
}

/// Response for the smooth-boundary endpoint.
#[derive(Debug, Serialize)]
struct SmoothBoundaryResponse {
    /// The smoothing method that was applied.
    method: String,
    /// Updated boundary SSIM (if available).
    updated_ssim: Option<f64>,
}

/// Response for the clear-stale endpoint.
#[derive(Debug, Serialize)]
struct ClearStaleResponse {
    cleared: bool,
}

// ---------------------------------------------------------------------------
// POST /api/v1/segments/{id}/regenerate
// ---------------------------------------------------------------------------

/// Regenerate a single segment, preserving the old version.
///
/// The old segment is soft-deleted and linked via `previous_segment_id`.
/// Downstream segments are flagged as stale.
pub async fn regenerate(
    State(state): State<AppState>,
    _auth: AuthUser,
    Path(segment_id): Path<DbId>,
    Json(body): Json<RegenerateRequest>,
) -> AppResult<impl IntoResponse> {
    ensure_segment_exists(&state.pool, segment_id).await?;

    // Load the existing segment to get context.
    let segment = SegmentRepo::find_by_id(&state.pool, segment_id)
        .await?
        .expect("ensured above");

    // Create a new segment at the same position with the same seed frame.
    let new_seg = SegmentRepo::create(
        &state.pool,
        &x121_db::models::segment::CreateSegment {
            scene_id: segment.scene_id,
            sequence_index: segment.sequence_index,
            status_id: Some(1), // Pending
            seed_frame_path: segment.seed_frame_path.clone(),
            output_video_path: None,
            last_frame_path: None,
            quality_scores: body.modified_params,
            duration_secs: None,
            cumulative_duration_secs: None,
            boundary_frame_index: None,
            boundary_selection_mode: None,
            generation_started_at: None,
            generation_completed_at: None,
            worker_id: None,
            prompt_type: segment.prompt_type.clone(),
            prompt_text: segment.prompt_text.clone(),
        },
    )
    .await?;

    // Archive: link the new segment to the old one.
    SegmentVersionRepo::archive_segment(
        &state.pool,
        new_seg.id,
        segment.id,
        segment.regeneration_count + 1,
    )
    .await?;

    // Soft-delete the old segment so it doesn't appear in the active list
    // but is still accessible via version history.
    SegmentRepo::soft_delete(&state.pool, segment.id).await?;

    // Flag downstream segments as stale.
    let stale_count = SegmentVersionRepo::flag_downstream_stale(
        &state.pool,
        segment.scene_id,
        segment.sequence_index,
    )
    .await?;

    Ok(Json(DataResponse {
        data: RegenerateResponse {
            new_segment_id: new_seg.id,
            stale_count,
        },
    }))
}

// ---------------------------------------------------------------------------
// GET /api/v1/segments/{id}/boundary-check
// ---------------------------------------------------------------------------

/// Check boundary consistency (SSIM) for a segment's transitions.
pub async fn boundary_check(
    State(state): State<AppState>,
    Path(segment_id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    ensure_segment_exists(&state.pool, segment_id).await?;

    let segment = SegmentRepo::find_by_id(&state.pool, segment_id)
        .await?
        .expect("ensured above");

    let threshold = restitching::DEFAULT_SSIM_THRESHOLD;

    let result = BoundaryCheckResult {
        before_ssim: segment.boundary_ssim_before,
        after_ssim: segment.boundary_ssim_after,
        needs_smoothing_before: segment.boundary_ssim_before.is_some_and(|v| v < threshold),
        needs_smoothing_after: segment.boundary_ssim_after.is_some_and(|v| v < threshold),
    };

    Ok(Json(DataResponse { data: result }))
}

// ---------------------------------------------------------------------------
// POST /api/v1/segments/{id}/smooth-boundary
// ---------------------------------------------------------------------------

/// Apply boundary smoothing to a segment.
pub async fn smooth_boundary(
    State(state): State<AppState>,
    _auth: AuthUser,
    Path(segment_id): Path<DbId>,
    Json(body): Json<SmoothBoundaryRequest>,
) -> AppResult<impl IntoResponse> {
    ensure_segment_exists(&state.pool, segment_id).await?;

    // Validate smoothing method via core domain logic.
    let method = restitching::validate_smoothing_method(&body.method)?;

    // Determine which boundary side.
    let _position = match body.boundary.as_str() {
        "before" => restitching::BoundaryPosition::Before,
        "after" => restitching::BoundaryPosition::After,
        other => {
            return Err(crate::error::AppError::Core(
                x121_core::error::CoreError::Validation(format!(
                    "Invalid boundary position: '{other}'. Must be 'before' or 'after'."
                )),
            ));
        }
    };

    // For ManualAccept, just mark the boundary as accepted (clear the score
    // concern by setting it to 1.0).
    let updated_ssim = if method == restitching::SmoothingMethod::ManualAccept {
        let ssim = 1.0;
        match body.boundary.as_str() {
            "before" => {
                SegmentVersionRepo::update_boundary_ssim(&state.pool, segment_id, Some(ssim), None)
                    .await?;
            }
            _ => {
                SegmentVersionRepo::update_boundary_ssim(&state.pool, segment_id, None, Some(ssim))
                    .await?;
            }
        }
        Some(ssim)
    } else {
        // For FrameBlending / ReExtraction, the actual smoothing is performed
        // asynchronously by the pipeline worker. Here we acknowledge the request.
        None
    };

    Ok(Json(DataResponse {
        data: SmoothBoundaryResponse {
            method: body.method,
            updated_ssim,
        },
    }))
}

// ---------------------------------------------------------------------------
// GET /api/v1/segments/{id}/versions
// ---------------------------------------------------------------------------

/// Get the version history for a segment position.
pub async fn list_versions(
    State(state): State<AppState>,
    Path(segment_id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    // Note: we don't require ensure_segment_exists here because the segment
    // might be soft-deleted but still valid for version lookup.
    let versions = SegmentVersionRepo::list_versions(&state.pool, segment_id).await?;
    Ok(Json(DataResponse { data: versions }))
}

// ---------------------------------------------------------------------------
// PATCH /api/v1/segments/{id}/clear-stale
// ---------------------------------------------------------------------------

/// Clear the stale flag on a segment (manual approval that the segment is OK).
pub async fn clear_stale(
    State(state): State<AppState>,
    _auth: AuthUser,
    Path(segment_id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    ensure_segment_exists(&state.pool, segment_id).await?;
    let cleared = SegmentVersionRepo::clear_stale_flag(&state.pool, segment_id).await?;
    Ok(Json(DataResponse {
        data: ClearStaleResponse { cleared },
    }))
}
