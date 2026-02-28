//! Route definitions for Director's View mobile/tablet review (PRD-55).
//!
//! All routes are user-level (require `AuthUser`, not admin-only).
//! Nested under `/user`.

use axum::routing::{get, post};
use axum::Router;

use crate::handlers::directors_view;
use crate::state::AppState;

/// Director's View user-level routes.
///
/// ```text
/// GET    /review-queue                      get_review_queue
/// POST   /review-queue/{segment_id}/action  submit_review_action
/// POST   /push-subscription                 register_push_subscription
/// DELETE /push-subscription                 delete_push_subscription
/// POST   /sync                              sync_offline_actions
/// GET    /activity-feed                     get_mobile_activity_feed
/// ```
pub fn directors_view_router() -> Router<AppState> {
    Router::new()
        .route("/review-queue", get(directors_view::get_review_queue))
        .route(
            "/review-queue/{segment_id}/action",
            post(directors_view::submit_review_action),
        )
        .route(
            "/push-subscription",
            post(directors_view::register_push_subscription)
                .delete(directors_view::delete_push_subscription),
        )
        .route("/sync", post(directors_view::sync_offline_actions))
        .route(
            "/activity-feed",
            get(directors_view::get_mobile_activity_feed),
        )
}
