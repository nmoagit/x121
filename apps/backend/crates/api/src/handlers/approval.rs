//! Handlers for the segment approval workflow (PRD-35).
//!
//! Provides endpoints for approving, rejecting, and flagging segments,
//! querying the review queue, and listing rejection categories.

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;

use trulience_core::approval::{DECISION_APPROVED, DECISION_FLAGGED, DECISION_REJECTED};
use trulience_core::error::CoreError;
use trulience_core::types::DbId;
use trulience_db::models::approval::{
    ApproveRequest, CreateApproval, FlagRequest, RejectRequest,
};
use trulience_db::repositories::{ApprovalRepo, RejectionCategoryRepo};

use crate::error::{AppError, AppResult};
use crate::handlers::segment::ensure_segment_exists;
use crate::middleware::auth::AuthUser;
use crate::response::DataResponse;
use crate::state::AppState;

/// POST /api/v1/segments/{segment_id}/approve
///
/// Record an approval decision for a segment. Requires authentication.
pub async fn approve_segment(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(segment_id): Path<DbId>,
    Json(input): Json<ApproveRequest>,
) -> AppResult<impl IntoResponse> {
    ensure_segment_exists(&state.pool, segment_id).await?;

    let create = CreateApproval {
        segment_id,
        user_id: auth.user_id,
        decision: DECISION_APPROVED.to_string(),
        reason_category_id: None,
        comment: None,
        segment_version: input.segment_version,
    };

    let approval = ApprovalRepo::create(&state.pool, &create).await?;

    tracing::info!(
        user_id = auth.user_id,
        segment_id = segment_id,
        decision = DECISION_APPROVED,
        "Segment approved"
    );

    Ok((StatusCode::CREATED, Json(DataResponse { data: approval })))
}

/// POST /api/v1/segments/{segment_id}/reject
///
/// Record a rejection decision for a segment. Optionally includes a rejection
/// category and comment.
pub async fn reject_segment(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(segment_id): Path<DbId>,
    Json(input): Json<RejectRequest>,
) -> AppResult<impl IntoResponse> {
    ensure_segment_exists(&state.pool, segment_id).await?;

    // If a category ID was provided, verify it exists.
    if let Some(cat_id) = input.reason_category_id {
        RejectionCategoryRepo::find_by_id(&state.pool, cat_id)
            .await?
            .ok_or_else(|| {
                AppError::Core(CoreError::NotFound {
                    entity: "RejectionCategory",
                    id: cat_id,
                })
            })?;
    }

    let create = CreateApproval {
        segment_id,
        user_id: auth.user_id,
        decision: DECISION_REJECTED.to_string(),
        reason_category_id: input.reason_category_id,
        comment: input.comment,
        segment_version: input.segment_version,
    };

    let approval = ApprovalRepo::create(&state.pool, &create).await?;

    tracing::info!(
        user_id = auth.user_id,
        segment_id = segment_id,
        decision = DECISION_REJECTED,
        reason_category_id = ?input.reason_category_id,
        "Segment rejected"
    );

    Ok((StatusCode::CREATED, Json(DataResponse { data: approval })))
}

/// POST /api/v1/segments/{segment_id}/flag
///
/// Flag a segment for discussion. Optionally includes a comment.
pub async fn flag_segment(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(segment_id): Path<DbId>,
    Json(input): Json<FlagRequest>,
) -> AppResult<impl IntoResponse> {
    ensure_segment_exists(&state.pool, segment_id).await?;

    let create = CreateApproval {
        segment_id,
        user_id: auth.user_id,
        decision: DECISION_FLAGGED.to_string(),
        reason_category_id: None,
        comment: input.comment,
        segment_version: input.segment_version,
    };

    let approval = ApprovalRepo::create(&state.pool, &create).await?;

    tracing::info!(
        user_id = auth.user_id,
        segment_id = segment_id,
        decision = DECISION_FLAGGED,
        "Segment flagged"
    );

    Ok((StatusCode::CREATED, Json(DataResponse { data: approval })))
}

/// GET /api/v1/segments/{segment_id}/approvals
///
/// List all approval decisions for a segment.
pub async fn list_approvals(
    _auth: AuthUser,
    State(state): State<AppState>,
    Path(segment_id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let approvals = ApprovalRepo::list_for_segment(&state.pool, segment_id).await?;
    Ok(Json(DataResponse { data: approvals }))
}

/// GET /api/v1/scenes/{scene_id}/review-queue
///
/// Returns the review queue for a scene: all segments with their approval status.
pub async fn get_review_queue(
    _auth: AuthUser,
    State(state): State<AppState>,
    Path(scene_id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let queue = ApprovalRepo::get_review_queue(&state.pool, scene_id).await?;
    Ok(Json(DataResponse { data: queue }))
}

/// GET /api/v1/rejection-categories
///
/// Returns all available rejection categories.
pub async fn list_rejection_categories(
    _auth: AuthUser,
    State(state): State<AppState>,
) -> AppResult<impl IntoResponse> {
    let categories = RejectionCategoryRepo::list_all(&state.pool).await?;
    Ok(Json(DataResponse { data: categories }))
}
