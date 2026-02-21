//! Route definitions for script management endpoints (PRD-09).

use axum::routing::{get, post};
use axum::Router;

use crate::handlers::scripts;
use crate::state::AppState;

/// Admin routes mounted at `/admin/scripts`.
///
/// All routes require the `admin` role (enforced by handler extractors).
///
/// ```text
/// POST   /                          -> register_script
/// GET    /                          -> list_scripts
/// GET    /{id}                      -> get_script
/// PUT    /{id}                      -> update_script
/// DELETE /{id}                      -> deactivate_script
/// POST   /{id}/test                 -> test_script
/// GET    /{id}/executions           -> list_executions
/// GET    /executions/{id}           -> get_execution
/// ```
pub fn router() -> Router<AppState> {
    Router::new()
        .route(
            "/",
            get(scripts::list_scripts).post(scripts::register_script),
        )
        .route(
            "/{id}",
            get(scripts::get_script)
                .put(scripts::update_script)
                .delete(scripts::deactivate_script),
        )
        .route("/{id}/test", post(scripts::test_script))
        .route("/{id}/executions", get(scripts::list_executions))
        .route("/executions/{id}", get(scripts::get_execution))
}
