//! Route definitions for bug reporting (PRD-44).
//!
//! Mounted at `/bug-reports` by `api_routes()`.

use axum::routing::{get, post, put};
use axum::Router;

use crate::handlers::bug_reports;
use crate::state::AppState;

/// Bug report routes.
///
/// ```text
/// POST   /                  -> submit_bug_report
/// GET    /                  -> list_bug_reports
/// GET    /{id}              -> get_bug_report
/// PUT    /{id}/status       -> update_bug_report_status (admin only)
/// ```
pub fn router() -> Router<AppState> {
    Router::new()
        .route(
            "/",
            post(bug_reports::submit_bug_report).get(bug_reports::list_bug_reports),
        )
        .route("/{id}", get(bug_reports::get_bug_report))
        .route("/{id}/status", put(bug_reports::update_bug_report_status))
}
