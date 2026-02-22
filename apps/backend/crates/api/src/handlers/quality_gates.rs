//! Handlers for automated quality gate endpoints (PRD-49).
//!
//! Provides per-segment QA score retrieval, per-scene QA summary,
//! and project/studio threshold management.

use axum::extract::{Path, State};
use axum::response::IntoResponse;
use axum::Json;
use trulience_core::quality_gate;
use trulience_core::types::DbId;
use trulience_db::models::qa_threshold::CreateQaThreshold;
use trulience_db::repositories::{QaThresholdRepo, QualityScoreRepo};

use crate::error::AppResult;
use crate::middleware::auth::AuthUser;
use crate::response::DataResponse;
use crate::state::AppState;

// ---------------------------------------------------------------------------
// Segment QA scores
// ---------------------------------------------------------------------------

/// GET /api/v1/segments/{segment_id}/qa-scores
///
/// Returns all quality scores for the given segment.
pub async fn get_segment_scores(
    State(state): State<AppState>,
    Path(segment_id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let scores = QualityScoreRepo::find_by_segment(&state.pool, segment_id).await?;
    Ok(Json(DataResponse { data: scores }))
}

// ---------------------------------------------------------------------------
// Scene QA summary
// ---------------------------------------------------------------------------

/// GET /api/v1/scenes/{scene_id}/qa-summary
///
/// Returns an aggregated QA summary across all segments in the scene.
pub async fn get_scene_qa_summary(
    State(state): State<AppState>,
    Path(scene_id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let summary = QualityScoreRepo::summary_by_scene(&state.pool, scene_id).await?;
    Ok(Json(DataResponse { data: summary }))
}

// ---------------------------------------------------------------------------
// Project threshold management
// ---------------------------------------------------------------------------

/// GET /api/v1/projects/{project_id}/qa-thresholds
///
/// Returns effective thresholds for the project (project overrides merged
/// with studio defaults).
pub async fn list_thresholds(
    State(state): State<AppState>,
    Path(project_id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let thresholds = QaThresholdRepo::list_for_project(&state.pool, project_id).await?;
    Ok(Json(DataResponse { data: thresholds }))
}

/// POST /api/v1/projects/{project_id}/qa-thresholds
///
/// Upsert a project-level threshold for a specific check type.
pub async fn upsert_threshold(
    State(state): State<AppState>,
    _auth: AuthUser,
    Path(project_id): Path<DbId>,
    Json(body): Json<CreateQaThreshold>,
) -> AppResult<impl IntoResponse> {
    // Validate inputs via core domain logic.
    quality_gate::validate_check_type(&body.check_type)?;
    quality_gate::validate_threshold(body.warn_threshold, body.fail_threshold)?;

    let threshold =
        QaThresholdRepo::upsert(&state.pool, Some(project_id), &body).await?;
    Ok(Json(DataResponse { data: threshold }))
}

/// DELETE /api/v1/projects/{project_id}/qa-thresholds/{id}
///
/// Delete a project-level threshold override (reverts to studio default).
pub async fn delete_threshold(
    State(state): State<AppState>,
    _auth: AuthUser,
    Path((_project_id, id)): Path<(DbId, DbId)>,
) -> AppResult<impl IntoResponse> {
    QaThresholdRepo::delete(&state.pool, id).await?;
    Ok(Json(DataResponse {
        data: serde_json::Value::Null,
    }))
}

// ---------------------------------------------------------------------------
// Studio defaults
// ---------------------------------------------------------------------------

/// GET /api/v1/qa/quality-gates/defaults
///
/// Returns the studio-level default thresholds.
pub async fn list_studio_defaults(
    State(state): State<AppState>,
) -> AppResult<impl IntoResponse> {
    let defaults = QaThresholdRepo::list_studio_defaults(&state.pool).await?;
    Ok(Json(DataResponse { data: defaults }))
}
