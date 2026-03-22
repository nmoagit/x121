//! Route definitions for avatar review allocation (PRD-129).

use axum::routing::{get, patch, post};
use axum::Router;

use crate::handlers::avatar_review;
use crate::state::AppState;

/// Project-scoped review routes.
///
/// Mounted under `/api/v1/projects/{project_id}/review`.
///
/// ```text
/// GET    /assignments                list_assignments
/// POST   /assignments                assign_avatars
/// PATCH  /assignments/{assignment_id} reassign
/// POST   /auto-allocate             auto_allocate
/// GET    /workload                  get_workload
/// GET    /audit-log                 get_project_audit_log
/// GET    /audit-log/export          export_audit_log
/// ```
pub fn project_review_router() -> Router<AppState> {
    Router::new()
        .route(
            "/assignments",
            get(avatar_review::list_assignments).post(avatar_review::assign_avatars),
        )
        .route(
            "/assignments/{assignment_id}",
            patch(avatar_review::reassign),
        )
        .route("/auto-allocate", post(avatar_review::auto_allocate))
        .route("/workload", get(avatar_review::get_workload))
        .route("/audit-log", get(avatar_review::get_project_audit_log))
        .route("/audit-log/export", get(avatar_review::export_audit_log))
}

/// Global reviewer routes.
///
/// Mounted under `/api/v1/review/avatar-assignments`.
///
/// ```text
/// GET    /my-queue                              my_queue
/// POST   /assignments/{assignment_id}/start     start_review
/// POST   /assignments/{assignment_id}/decide    submit_decision
/// ```
pub fn reviewer_router() -> Router<AppState> {
    Router::new()
        .route("/my-queue", get(avatar_review::my_queue))
        .route(
            "/assignments/{assignment_id}/start",
            post(avatar_review::start_review),
        )
        .route(
            "/assignments/{assignment_id}/decide",
            post(avatar_review::submit_decision),
        )
}

/// Avatar-scoped review routes.
///
/// Merged into the `/api/v1/avatars` route tree.
///
/// ```text
/// POST   /{avatar_id}/submit-for-rereview    submit_for_rereview
/// GET    /{avatar_id}/review-history          get_review_history
/// ```
pub fn avatar_review_router() -> Router<AppState> {
    Router::new()
        .route(
            "/{avatar_id}/submit-for-rereview",
            post(avatar_review::submit_for_rereview),
        )
        .route(
            "/{avatar_id}/review-history",
            get(avatar_review::get_review_history),
        )
}
