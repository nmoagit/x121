//! Route definitions for the Studio Pulse Dashboard (PRD-42).
//!
//! All endpoints require authentication.

use axum::routing::get;
use axum::Router;

use crate::handlers::dashboard;
use crate::state::AppState;

/// Widget data routes mounted at `/dashboard`.
///
/// ```text
/// GET  /widgets/active-tasks       -> active_tasks
/// GET  /widgets/project-progress   -> project_progress
/// GET  /widgets/disk-health        -> disk_health
/// GET  /widgets/activity-feed      -> activity_feed
/// ```
pub fn router() -> Router<AppState> {
    Router::new()
        .route("/widgets/active-tasks", get(dashboard::active_tasks))
        .route("/widgets/project-progress", get(dashboard::project_progress))
        .route("/widgets/disk-health", get(dashboard::disk_health))
        .route("/widgets/activity-feed", get(dashboard::activity_feed))
}

/// User dashboard config routes mounted at `/user/dashboard`.
///
/// ```text
/// GET  /   -> get_dashboard_config
/// PUT  /   -> save_dashboard_config
/// ```
pub fn user_router() -> Router<AppState> {
    Router::new().route(
        "/",
        get(dashboard::get_dashboard_config).put(dashboard::save_dashboard_config),
    )
}
