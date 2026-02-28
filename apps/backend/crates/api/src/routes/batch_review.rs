//! Route definitions for batch review & approval workflows (PRD-92).
//!
//! Nested under `/api/v1/batch-review`.

use axum::routing::{get, post, put};
use axum::Router;

use crate::handlers::batch_review;
use crate::state::AppState;

/// Batch review routes.
///
/// ```text
/// POST   /batch-approve                batch_approve
/// POST   /batch-reject                 batch_reject
/// POST   /auto-approve                 auto_approve
/// GET    /assignments                  list_assignments
/// POST   /assignments                  create_assignment
/// PUT    /assignments/{id}             update_assignment
/// DELETE /assignments/{id}             delete_assignment
/// GET    /progress                     get_review_progress
/// POST   /sessions                     start_session
/// POST   /sessions/{id}/end            end_session
/// ```
pub fn batch_review_router() -> Router<AppState> {
    Router::new()
        .route("/batch-approve", post(batch_review::batch_approve))
        .route("/batch-reject", post(batch_review::batch_reject))
        .route("/auto-approve", post(batch_review::auto_approve))
        .route(
            "/assignments",
            get(batch_review::list_assignments).post(batch_review::create_assignment),
        )
        .route(
            "/assignments/{id}",
            put(batch_review::update_assignment).delete(batch_review::delete_assignment),
        )
        .route("/progress", get(batch_review::get_review_progress))
        .route("/sessions", post(batch_review::start_session))
        .route("/sessions/{id}/end", post(batch_review::end_session))
}
