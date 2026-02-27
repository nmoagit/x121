//! Route definitions for validation dashboard endpoints (PRD-113).
//!
//! Merged into the project router at `/{id}/validation-summary` and
//! `/{id}/validate`.

use axum::routing::{get, post};
use axum::Router;

use crate::handlers::validation_dashboard;
use crate::state::AppState;

/// Validation dashboard routes, merged into project routes.
///
/// ```text
/// GET    /{id}/validation-summary  -> get_validation_summary
/// POST   /{id}/validate            -> revalidate_project
/// ```
pub fn router() -> Router<AppState> {
    Router::new()
        .route(
            "/{id}/validation-summary",
            get(validation_dashboard::get_validation_summary),
        )
        .route(
            "/{id}/validate",
            post(validation_dashboard::revalidate_project),
        )
}
