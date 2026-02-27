//! Routes for the live activity console & logging system (PRD-118).

use axum::routing::{delete, get, put};
use axum::Router;

use crate::handlers::activity_log;
use crate::state::AppState;

/// Public activity log routes (require auth).
///
/// Nested under `/activity-logs`.
pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", get(activity_log::query_activity_logs))
        .route("/export", get(activity_log::export_activity_logs))
}

/// Admin activity log routes.
///
/// Nested under `/admin/activity-logs`.
pub fn admin_router() -> Router<AppState> {
    Router::new()
        .route("/settings", get(activity_log::get_settings))
        .route("/settings", put(activity_log::update_settings))
        .route("/", delete(activity_log::manual_purge))
}
