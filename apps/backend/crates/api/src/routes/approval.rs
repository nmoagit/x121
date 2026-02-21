//! Route definitions for segment approval workflow (PRD-35).
//!
//! These routes are merged into the `/segments` and `/scenes` route groups
//! for approval actions, review queue, and rejection categories.

use axum::routing::{get, post};
use axum::Router;

use crate::handlers::approval;
use crate::state::AppState;

/// Segment-scoped approval routes, merged into `/segments`.
///
/// ```text
/// POST   /{segment_id}/approve      approve_segment
/// POST   /{segment_id}/reject       reject_segment
/// POST   /{segment_id}/flag         flag_segment
/// GET    /{segment_id}/approvals    list_approvals
/// ```
pub fn segment_router() -> Router<AppState> {
    Router::new()
        .route("/{segment_id}/approve", post(approval::approve_segment))
        .route("/{segment_id}/reject", post(approval::reject_segment))
        .route("/{segment_id}/flag", post(approval::flag_segment))
        .route(
            "/{segment_id}/approvals",
            get(approval::list_approvals),
        )
}

/// Scene-scoped review queue route, merged into `/scenes`.
///
/// ```text
/// GET    /{scene_id}/review-queue   get_review_queue
/// ```
pub fn scene_review_router() -> Router<AppState> {
    Router::new().route("/{scene_id}/review-queue", get(approval::get_review_queue))
}

/// Top-level rejection categories route.
///
/// ```text
/// GET    /                          list_rejection_categories
/// ```
pub fn rejection_categories_router() -> Router<AppState> {
    Router::new().route("/", get(approval::list_rejection_categories))
}
