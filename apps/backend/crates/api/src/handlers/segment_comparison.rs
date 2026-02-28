//! Handlers for segment regeneration comparison (PRD-101).
//!
//! Provides endpoints for listing version history, comparing two versions
//! side-by-side, selecting an active version, and fetching a single version.

use axum::extract::{Path, Query, State};
use axum::response::IntoResponse;
use axum::Json;
use serde::{Deserialize, Serialize};
use x121_core::error::CoreError;
use x121_core::segment_comparison::compute_score_diffs;
use x121_core::types::DbId;
use x121_db::models::segment_version::VersionComparison;
use x121_db::repositories::SegmentVersionRepo;

use crate::error::{AppError, AppResult};
use crate::handlers::segment::ensure_segment_exists;
use crate::middleware::auth::AuthUser;
use crate::response::DataResponse;
use crate::state::AppState;

// ---------------------------------------------------------------------------
// Query parameter DTOs
// ---------------------------------------------------------------------------

/// Query parameters for the compare endpoint.
#[derive(Debug, Deserialize)]
pub struct CompareQuery {
    /// Version number of the first (older) version.
    pub v1: i32,
    /// Version number of the second (newer) version.
    pub v2: i32,
}

// ---------------------------------------------------------------------------
// Response DTOs
// ---------------------------------------------------------------------------

/// Response after selecting a version.
#[derive(Debug, Serialize)]
struct SelectVersionResponse {
    /// Whether the selection was applied.
    selected: bool,
}

// ---------------------------------------------------------------------------
// GET /api/v1/segments/{id}/version-history
// ---------------------------------------------------------------------------

/// List all versions of a segment, ordered by version number descending.
pub async fn list_version_history(
    State(state): State<AppState>,
    Path(segment_id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    ensure_segment_exists(&state.pool, segment_id).await?;
    let versions = SegmentVersionRepo::get_version_history(&state.pool, segment_id).await?;
    Ok(Json(DataResponse { data: versions }))
}

// ---------------------------------------------------------------------------
// GET /api/v1/segments/{id}/compare?v1={n}&v2={n}
// ---------------------------------------------------------------------------

/// Compare two versions of a segment by version number.
///
/// Returns both versions and per-metric QA score differences.
pub async fn compare_versions(
    State(state): State<AppState>,
    Path(segment_id): Path<DbId>,
    Query(params): Query<CompareQuery>,
) -> AppResult<impl IntoResponse> {
    ensure_segment_exists(&state.pool, segment_id).await?;

    if params.v1 == params.v2 {
        return Err(AppError::BadRequest(
            "v1 and v2 must be different version numbers".into(),
        ));
    }

    let pair =
        SegmentVersionRepo::get_comparison_pair(&state.pool, segment_id, params.v1, params.v2)
            .await?
            .ok_or_else(|| {
                AppError::Core(CoreError::Validation(format!(
                    "One or both versions not found: v1={}, v2={}",
                    params.v1, params.v2
                )))
            })?;

    let (old_version, new_version) = pair;

    let score_diffs = match (&old_version.qa_scores_json, &new_version.qa_scores_json) {
        (Some(old_scores), Some(new_scores)) => Some(compute_score_diffs(old_scores, new_scores)),
        _ => None,
    };

    let comparison = VersionComparison {
        old_version,
        new_version,
        score_diffs,
    };

    Ok(Json(DataResponse { data: comparison }))
}

// ---------------------------------------------------------------------------
// POST /api/v1/segments/{id}/versions/{version_id}/select
// ---------------------------------------------------------------------------

/// Mark a specific version as the selected (active) version for a segment.
pub async fn select_version(
    State(state): State<AppState>,
    _auth: AuthUser,
    Path((segment_id, version_id)): Path<(DbId, DbId)>,
) -> AppResult<impl IntoResponse> {
    ensure_segment_exists(&state.pool, segment_id).await?;

    let selected = SegmentVersionRepo::select_version(&state.pool, segment_id, version_id).await?;

    if !selected {
        return Err(AppError::Core(CoreError::NotFound {
            entity: "SegmentVersion",
            id: version_id,
        }));
    }

    Ok(Json(DataResponse {
        data: SelectVersionResponse { selected },
    }))
}

// ---------------------------------------------------------------------------
// GET /api/v1/segments/{id}/versions/{version_id}
// ---------------------------------------------------------------------------

/// Get a single version by its ID.
pub async fn get_version(
    State(state): State<AppState>,
    Path((segment_id, version_id)): Path<(DbId, DbId)>,
) -> AppResult<impl IntoResponse> {
    ensure_segment_exists(&state.pool, segment_id).await?;

    let version = SegmentVersionRepo::find_version_by_id(&state.pool, version_id)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "SegmentVersion",
            id: version_id,
        }))?;

    // Verify the version belongs to the segment from the URL path.
    if version.segment_id != segment_id {
        return Err(AppError::Core(CoreError::NotFound {
            entity: "SegmentVersion",
            id: version_id,
        }));
    }

    Ok(Json(DataResponse { data: version }))
}
