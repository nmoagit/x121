//! Route definitions for character review allocation (PRD-129).

use axum::routing::{get, patch, post};
use axum::Router;

use crate::handlers::character_review;
use crate::state::AppState;

/// Project-scoped review routes.
///
/// Mounted under `/api/v1/projects/{project_id}/review`.
///
/// ```text
/// GET    /assignments                list_assignments
/// POST   /assignments                assign_characters
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
            get(character_review::list_assignments).post(character_review::assign_characters),
        )
        .route(
            "/assignments/{assignment_id}",
            patch(character_review::reassign),
        )
        .route("/auto-allocate", post(character_review::auto_allocate))
        .route("/workload", get(character_review::get_workload))
        .route("/audit-log", get(character_review::get_project_audit_log))
        .route("/audit-log/export", get(character_review::export_audit_log))
}

/// Global reviewer routes.
///
/// Mounted under `/api/v1/review/character-assignments`.
///
/// ```text
/// GET    /my-queue                              my_queue
/// POST   /assignments/{assignment_id}/start     start_review
/// POST   /assignments/{assignment_id}/decide    submit_decision
/// ```
pub fn reviewer_router() -> Router<AppState> {
    Router::new()
        .route("/my-queue", get(character_review::my_queue))
        .route(
            "/assignments/{assignment_id}/start",
            post(character_review::start_review),
        )
        .route(
            "/assignments/{assignment_id}/decide",
            post(character_review::submit_decision),
        )
}

/// Character-scoped review routes.
///
/// Merged into the `/api/v1/characters` route tree.
///
/// ```text
/// POST   /{character_id}/submit-for-rereview    submit_for_rereview
/// GET    /{character_id}/review-history          get_review_history
/// ```
pub fn character_review_router() -> Router<AppState> {
    Router::new()
        .route(
            "/{character_id}/submit-for-rereview",
            post(character_review::submit_for_rereview),
        )
        .route(
            "/{character_id}/review-history",
            get(character_review::get_review_history),
        )
}
