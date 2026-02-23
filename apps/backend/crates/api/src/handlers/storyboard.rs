//! Handlers for the Storyboard View & Scene Thumbnails feature (PRD-62).
//!
//! Provides endpoints for listing, creating, and deleting keyframes
//! used for storyboard filmstrip previews and hover-scrub.

use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;

use serde::Deserialize;

use trulience_core::search::{clamp_limit, clamp_offset, DEFAULT_SEARCH_LIMIT, MAX_SEARCH_LIMIT};
use trulience_core::storyboard;
use trulience_core::types::DbId;
use trulience_db::models::keyframe::CreateKeyframe;
use trulience_db::repositories::KeyframeRepo;

use crate::error::AppResult;
use crate::middleware::auth::AuthUser;
use crate::response::DataResponse;
use crate::state::AppState;

// ---------------------------------------------------------------------------
// Query parameters
// ---------------------------------------------------------------------------

/// Pagination parameters for scene storyboard listing.
#[derive(Debug, Deserialize)]
pub struct StoryboardParams {
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

// ---------------------------------------------------------------------------
// Request types
// ---------------------------------------------------------------------------

/// Request body for creating a new keyframe.
#[derive(Debug, Deserialize)]
pub struct CreateKeyframeRequest {
    pub segment_id: DbId,
    pub frame_number: i32,
    pub timestamp_secs: f64,
    pub thumbnail_path: String,
    pub full_res_path: Option<String>,
}

// ---------------------------------------------------------------------------
// GET /scenes/{scene_id}/storyboard
// ---------------------------------------------------------------------------

/// List all keyframes for a scene's storyboard.
///
/// Returns keyframes across all segments of the scene, ordered by
/// segment sequence position then frame number.
pub async fn list_scene_storyboard(
    State(state): State<AppState>,
    Path(scene_id): Path<DbId>,
    Query(params): Query<StoryboardParams>,
) -> AppResult<impl IntoResponse> {
    let limit = clamp_limit(params.limit, DEFAULT_SEARCH_LIMIT, MAX_SEARCH_LIMIT);
    let offset = clamp_offset(params.offset);

    let keyframes = KeyframeRepo::list_for_scene(&state.pool, scene_id, limit, offset).await?;

    tracing::debug!(
        count = keyframes.len(),
        scene_id,
        "Listed scene storyboard keyframes"
    );

    Ok(Json(DataResponse { data: keyframes }))
}

// ---------------------------------------------------------------------------
// GET /keyframes/segment/{segment_id}
// ---------------------------------------------------------------------------

/// List keyframes for a specific segment.
pub async fn list_segment_keyframes(
    State(state): State<AppState>,
    Path(segment_id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let keyframes = KeyframeRepo::list_for_segment(&state.pool, segment_id).await?;

    tracing::debug!(
        count = keyframes.len(),
        segment_id,
        "Listed segment keyframes"
    );

    Ok(Json(DataResponse { data: keyframes }))
}

// ---------------------------------------------------------------------------
// POST /keyframes
// ---------------------------------------------------------------------------

/// Create a new keyframe record.
///
/// Validates the frame number before persisting.
pub async fn create_keyframe(
    State(state): State<AppState>,
    _auth: AuthUser,
    Json(body): Json<CreateKeyframeRequest>,
) -> AppResult<impl IntoResponse> {
    storyboard::validate_frame_number(body.frame_number)?;

    let input = CreateKeyframe {
        segment_id: body.segment_id,
        frame_number: body.frame_number,
        timestamp_secs: body.timestamp_secs,
        thumbnail_path: body.thumbnail_path,
        full_res_path: body.full_res_path,
    };

    let keyframe = KeyframeRepo::create(&state.pool, &input).await?;

    tracing::info!(
        keyframe_id = keyframe.id,
        segment_id = keyframe.segment_id,
        frame_number = keyframe.frame_number,
        "Keyframe created"
    );

    Ok((StatusCode::CREATED, Json(DataResponse { data: keyframe })))
}

// ---------------------------------------------------------------------------
// DELETE /keyframes/segment/{segment_id}
// ---------------------------------------------------------------------------

/// Delete all keyframes for a segment (for re-extraction).
pub async fn delete_segment_keyframes(
    State(state): State<AppState>,
    _auth: AuthUser,
    Path(segment_id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let deleted = KeyframeRepo::delete_for_segment(&state.pool, segment_id).await?;

    tracing::info!(
        segment_id,
        deleted_count = deleted,
        "Segment keyframes deleted"
    );

    Ok(Json(DataResponse { data: deleted }))
}
