//! Handlers for batch review & approval workflows (PRD-92).
//!
//! Provides endpoints for batch approve/reject, auto-approve by QA threshold,
//! review assignment CRUD, review progress tracking, and session lifecycle.

use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use serde::Deserialize;

use x121_core::batch_review;
use x121_core::error::CoreError;
use x121_core::search::{clamp_limit, clamp_offset, DEFAULT_SEARCH_LIMIT, MAX_SEARCH_LIMIT};
use x121_core::types::DbId;
use x121_db::models::batch_review::{
    AutoApproveRequest, BatchActionResponse, BatchApproveRequest, BatchRejectRequest,
    CreateAssignment, ReviewProgressResponse, UpdateAssignment,
};
use x121_db::repositories::BatchReviewRepo;

use crate::error::{AppError, AppResult};
use crate::middleware::auth::AuthUser;
use crate::query::PaginationParams;
use crate::response::DataResponse;
use crate::state::AppState;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Verify that a review assignment exists, returning the full row.
async fn ensure_assignment_exists(
    pool: &sqlx::PgPool,
    id: DbId,
) -> AppResult<x121_db::models::batch_review::ReviewAssignment> {
    BatchReviewRepo::find_assignment_by_id(pool, id)
        .await?
        .ok_or_else(|| {
            AppError::Core(CoreError::NotFound {
                entity: "ReviewAssignment",
                id,
            })
        })
}

/// Validate that a segment ID list is non-empty (DRY-534).
fn require_non_empty_segment_ids(ids: &[DbId]) -> AppResult<()> {
    if ids.is_empty() {
        return Err(AppError::BadRequest(
            "segment_ids must not be empty".to_string(),
        ));
    }
    Ok(())
}

/// Parse an optional ISO 8601 deadline string into a `DateTime<Utc>`.
fn parse_deadline(deadline: Option<&str>) -> AppResult<Option<chrono::DateTime<chrono::Utc>>> {
    match deadline {
        Some(s) => {
            let dt = s
                .parse::<chrono::DateTime<chrono::Utc>>()
                .map_err(|e| AppError::BadRequest(format!("Invalid deadline format: {e}")))?;
            Ok(Some(dt))
        }
        None => Ok(None),
    }
}

// ---------------------------------------------------------------------------
// Query parameter types
// ---------------------------------------------------------------------------

/// Query parameters for listing assignments.
///
/// Embeds [`PaginationParams`] fields via flattening rather than duplicating
/// `limit`/`offset` locally (DRY-532).
#[derive(Debug, Deserialize)]
pub struct AssignmentListParams {
    pub project_id: DbId,
    #[serde(flatten)]
    pub pagination: PaginationParams,
}

/// Query parameters for review progress.
#[derive(Debug, Deserialize)]
pub struct ProgressParams {
    pub project_id: DbId,
}

// ---------------------------------------------------------------------------
// Batch operations
// ---------------------------------------------------------------------------

/// POST /api/v1/batch-review/batch-approve
///
/// Approve multiple segments at once by creating approval records.
pub async fn batch_approve(
    auth: AuthUser,
    State(state): State<AppState>,
    Json(request): Json<BatchApproveRequest>,
) -> AppResult<impl IntoResponse> {
    require_non_empty_segment_ids(&request.segment_ids)?;

    let count =
        BatchReviewRepo::batch_approve_segments(&state.pool, &request.segment_ids, auth.user_id)
            .await?;

    tracing::info!(
        user_id = auth.user_id,
        count = count,
        "Batch approved segments"
    );

    Ok(Json(DataResponse {
        data: BatchActionResponse {
            processed_count: count,
            segment_ids: request.segment_ids,
        },
    }))
}

/// POST /api/v1/batch-review/batch-reject
///
/// Reject multiple segments at once by creating rejection records.
pub async fn batch_reject(
    auth: AuthUser,
    State(state): State<AppState>,
    Json(request): Json<BatchRejectRequest>,
) -> AppResult<impl IntoResponse> {
    require_non_empty_segment_ids(&request.segment_ids)?;

    let count = BatchReviewRepo::batch_reject_segments(
        &state.pool,
        &request.segment_ids,
        auth.user_id,
        request.reason.as_deref(),
    )
    .await?;

    tracing::info!(
        user_id = auth.user_id,
        count = count,
        "Batch rejected segments"
    );

    Ok(Json(DataResponse {
        data: BatchActionResponse {
            processed_count: count,
            segment_ids: request.segment_ids,
        },
    }))
}

/// POST /api/v1/batch-review/auto-approve
///
/// Auto-approve segments in a project whose average QA score meets or
/// exceeds the specified threshold.
pub async fn auto_approve(
    auth: AuthUser,
    State(state): State<AppState>,
    Json(request): Json<AutoApproveRequest>,
) -> AppResult<impl IntoResponse> {
    // Validate threshold range (delegates to validate_unit_range via DRY-530).
    batch_review::validate_qa_threshold(request.threshold).map_err(AppError::Core)?;

    // Get all segment scores for the project.
    let scores = BatchReviewRepo::get_segment_scores(&state.pool, request.project_id).await?;

    // Filter to segments that pass the threshold.
    let passing_ids = batch_review::filter_above_threshold(&scores, request.threshold);

    if passing_ids.is_empty() {
        return Ok(Json(DataResponse {
            data: BatchActionResponse {
                processed_count: 0,
                segment_ids: vec![],
            },
        }));
    }

    let count =
        BatchReviewRepo::batch_approve_segments(&state.pool, &passing_ids, auth.user_id).await?;

    tracing::info!(
        user_id = auth.user_id,
        project_id = request.project_id,
        threshold = request.threshold,
        count = count,
        "Auto-approved segments above QA threshold"
    );

    Ok(Json(DataResponse {
        data: BatchActionResponse {
            processed_count: count,
            segment_ids: passing_ids,
        },
    }))
}

// ---------------------------------------------------------------------------
// Assignment CRUD
// ---------------------------------------------------------------------------

/// POST /api/v1/batch-review/assignments
///
/// Create a new review assignment for a project.
pub async fn create_assignment(
    auth: AuthUser,
    State(state): State<AppState>,
    Json(input): Json<CreateAssignment>,
) -> AppResult<impl IntoResponse> {
    let deadline = parse_deadline(input.deadline.as_deref())?;
    let filter = input.filter_criteria_json.unwrap_or(serde_json::json!({}));

    let assignment = BatchReviewRepo::create_assignment(
        &state.pool,
        input.project_id,
        input.reviewer_user_id,
        &filter,
        deadline,
        auth.user_id,
    )
    .await?;

    tracing::info!(
        user_id = auth.user_id,
        assignment_id = assignment.id,
        project_id = input.project_id,
        reviewer_user_id = input.reviewer_user_id,
        "Review assignment created"
    );

    Ok((StatusCode::CREATED, Json(DataResponse { data: assignment })))
}

/// GET /api/v1/batch-review/assignments?project_id=&limit=&offset=
///
/// List review assignments for a project.
pub async fn list_assignments(
    _auth: AuthUser,
    State(state): State<AppState>,
    Query(params): Query<AssignmentListParams>,
) -> AppResult<impl IntoResponse> {
    let limit = clamp_limit(params.pagination.limit, DEFAULT_SEARCH_LIMIT, MAX_SEARCH_LIMIT);
    let offset = clamp_offset(params.pagination.offset);

    let assignments =
        BatchReviewRepo::list_assignments(&state.pool, params.project_id, limit, offset).await?;

    Ok(Json(DataResponse { data: assignments }))
}

/// PUT /api/v1/batch-review/assignments/{id}
///
/// Update a review assignment (status, deadline, filter criteria).
pub async fn update_assignment(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(id): Path<DbId>,
    Json(input): Json<UpdateAssignment>,
) -> AppResult<impl IntoResponse> {
    ensure_assignment_exists(&state.pool, id).await?;

    // Validate status if provided.
    if let Some(ref status) = input.status {
        batch_review::validate_assignment_status(status).map_err(AppError::BadRequest)?;
    }

    let deadline = parse_deadline(input.deadline.as_deref())?;

    let assignment = BatchReviewRepo::update_assignment(
        &state.pool,
        id,
        input.status.as_deref(),
        deadline,
        input.filter_criteria_json.as_ref(),
    )
    .await?
    .ok_or_else(|| {
        AppError::Core(CoreError::NotFound {
            entity: "ReviewAssignment",
            id,
        })
    })?;

    tracing::info!(
        user_id = auth.user_id,
        assignment_id = id,
        "Review assignment updated"
    );

    Ok(Json(DataResponse { data: assignment }))
}

/// DELETE /api/v1/batch-review/assignments/{id}
///
/// Delete a review assignment.
pub async fn delete_assignment(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    ensure_assignment_exists(&state.pool, id).await?;

    BatchReviewRepo::delete_assignment(&state.pool, id).await?;

    tracing::info!(
        user_id = auth.user_id,
        assignment_id = id,
        "Review assignment deleted"
    );

    Ok(StatusCode::NO_CONTENT)
}

// ---------------------------------------------------------------------------
// Review progress
// ---------------------------------------------------------------------------

/// GET /api/v1/batch-review/progress?project_id=
///
/// Get review progress for a project.
pub async fn get_review_progress(
    _auth: AuthUser,
    State(state): State<AppState>,
    Query(params): Query<ProgressParams>,
) -> AppResult<impl IntoResponse> {
    let project_id = params.project_id;

    let total = BatchReviewRepo::count_project_segments(&state.pool, project_id).await?;
    let approved = BatchReviewRepo::count_approved_segments(&state.pool, project_id).await?;
    let rejected = BatchReviewRepo::count_rejected_segments(&state.pool, project_id).await?;
    let reviewed = BatchReviewRepo::count_reviewed_segments(&state.pool, project_id).await?;
    let pending = total - reviewed;

    // Try to compute estimated remaining time from the user's active session.
    let avg_pace = None::<f32>;
    let estimated = pending.max(0).checked_mul(1).and_then(|_| {
        avg_pace.map(|p| batch_review::estimate_remaining_seconds(pending as i32, p))
    });

    Ok(Json(DataResponse {
        data: ReviewProgressResponse {
            total_segments: total,
            reviewed_segments: reviewed,
            approved_segments: approved,
            rejected_segments: rejected,
            pending_segments: pending,
            avg_pace_seconds: avg_pace,
            estimated_remaining_seconds: estimated,
        },
    }))
}

// ---------------------------------------------------------------------------
// Session lifecycle
// ---------------------------------------------------------------------------

/// POST /api/v1/batch-review/sessions
///
/// Start a new review session for the authenticated user.
pub async fn start_session(
    auth: AuthUser,
    State(state): State<AppState>,
) -> AppResult<impl IntoResponse> {
    let session = BatchReviewRepo::start_session(&state.pool, auth.user_id).await?;

    tracing::info!(
        user_id = auth.user_id,
        session_id = session.id,
        "Review session started"
    );

    Ok((StatusCode::CREATED, Json(DataResponse { data: session })))
}

/// POST /api/v1/batch-review/sessions/{id}/end
///
/// End a review session, computing the average pace.
pub async fn end_session(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    // Get the session to compute pace.
    let existing = BatchReviewRepo::get_active_session(&state.pool, auth.user_id)
        .await?
        .ok_or_else(|| {
            AppError::Core(CoreError::NotFound {
                entity: "ReviewSession",
                id,
            })
        })?;

    // Compute elapsed time.
    let elapsed = (chrono::Utc::now() - existing.started_at).num_seconds() as f64;
    let total_reviewed = existing.segments_approved + existing.segments_rejected;
    let avg_pace = batch_review::compute_avg_pace(total_reviewed, elapsed);

    let session = BatchReviewRepo::end_session(&state.pool, id, avg_pace)
        .await?
        .ok_or_else(|| {
            AppError::Core(CoreError::NotFound {
                entity: "ReviewSession",
                id,
            })
        })?;

    tracing::info!(
        user_id = auth.user_id,
        session_id = id,
        avg_pace = ?avg_pace,
        "Review session ended"
    );

    Ok(Json(DataResponse { data: session }))
}
