//! Route definitions for project lifecycle management (PRD-72).
//!
//! - `project_lifecycle_router()` is merged into the `/projects` nest.
//! - `bulk_lifecycle_router()` is merged into the `/projects` nest.

use axum::routing::{get, post};
use axum::Router;

use crate::handlers::project_lifecycle;
use crate::state::AppState;

/// Per-project lifecycle routes.
///
/// ```text
/// POST  /{project_id}/transition/{state}   -> transition_project
/// GET   /{project_id}/completion-checklist  -> get_checklist
/// GET   /{project_id}/summary-report        -> get_summary
/// ```
pub fn project_lifecycle_router() -> Router<AppState> {
    Router::new()
        .route(
            "/{project_id}/transition/{state}",
            post(project_lifecycle::transition_project),
        )
        .route(
            "/{project_id}/completion-checklist",
            get(project_lifecycle::get_checklist),
        )
        .route(
            "/{project_id}/summary-report",
            get(project_lifecycle::get_summary),
        )
}

/// Bulk lifecycle routes.
///
/// ```text
/// POST  /bulk-archive  -> bulk_archive
/// ```
pub fn bulk_lifecycle_router() -> Router<AppState> {
    Router::new().route("/bulk-archive", post(project_lifecycle::bulk_archive))
}
