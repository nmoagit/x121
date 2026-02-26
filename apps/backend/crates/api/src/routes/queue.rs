//! Route definitions for queue management (PRD-08).
//!
//! Public queue status requires authentication.
//! Admin queue management requires the `admin` role.

use axum::routing::{get, put};
use axum::Router;

use crate::handlers::queue;
use crate::state::AppState;

/// Routes mounted at `/queue`.
///
/// ```text
/// GET  /         -> get_queue_status
/// ```
pub fn router() -> Router<AppState> {
    Router::new().route("/", get(queue::get_queue_status))
}

/// Admin routes mounted at `/admin/queue`.
///
/// ```text
/// PUT  /reorder  -> reorder_job
/// ```
pub fn admin_router() -> Router<AppState> {
    Router::new().route("/reorder", put(queue::reorder_job))
}

/// Admin scheduling policy routes mounted at `/admin/scheduling`.
///
/// ```text
/// GET  /policies      -> list_scheduling_policies
/// POST /policies      -> create_scheduling_policy
/// PUT  /policies/{id} -> update_scheduling_policy
/// ```
pub fn scheduling_admin_router() -> Router<AppState> {
    Router::new()
        .route(
            "/policies",
            get(queue::list_scheduling_policies).post(queue::create_scheduling_policy),
        )
        .route("/policies/{id}", put(queue::update_scheduling_policy))
}

/// Quota routes mounted at `/quota`.
///
/// ```text
/// GET /status -> get_quota_status
/// ```
pub fn quota_router() -> Router<AppState> {
    Router::new().route("/status", get(queue::get_quota_status))
}
