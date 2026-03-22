//! Route definitions for the avatar consistency report system (PRD-94).
//!
//! Avatar-scoped routes are merged into `/avatars`, project-scoped
//! routes are merged into `/projects`, and the standalone report lookup
//! is mounted at `/consistency-reports`.

use axum::routing::{get, post};
use axum::Router;

use crate::handlers::consistency_report;
use crate::state::AppState;

/// Avatar-scoped consistency report routes.
///
/// Merged into the `/avatars` router:
///
/// ```text
/// POST /{avatar_id}/consistency-report   -> generate_report
/// GET  /{avatar_id}/consistency-report   -> get_latest_report
/// ```
pub fn avatar_consistency_router() -> Router<AppState> {
    Router::new().route(
        "/{avatar_id}/consistency-report",
        post(consistency_report::generate_report).get(consistency_report::get_latest_report),
    )
}

/// Project-scoped consistency overview routes.
///
/// Merged into the `/projects` router:
///
/// ```text
/// GET  /{project_id}/consistency-overview   -> list_project_reports
/// POST /{project_id}/batch-consistency      -> batch_generate
/// ```
pub fn project_consistency_router() -> Router<AppState> {
    Router::new()
        .route(
            "/{project_id}/consistency-overview",
            get(consistency_report::list_project_reports),
        )
        .route(
            "/{project_id}/batch-consistency",
            post(consistency_report::batch_generate),
        )
}

/// Standalone consistency report lookup router.
///
/// Mounted at `/consistency-reports`:
///
/// ```text
/// GET /{id}  -> get_report
/// ```
pub fn consistency_report_router() -> Router<AppState> {
    Router::new().route("/{id}", get(consistency_report::get_report))
}
