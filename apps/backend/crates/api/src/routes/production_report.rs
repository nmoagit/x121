//! Route definitions for the production reporting system (PRD-73).
//!
//! Mounted at `/reports` and `/report-schedules` by `api_routes()`.

use axum::routing::{get, put};
use axum::Router;

use crate::handlers::production_report;
use crate::state::AppState;

/// Report routes.
///
/// ```text
/// GET    /                   -> list_reports (?limit, offset)
/// POST   /generate           -> generate_report
/// GET    /templates          -> list_report_types
/// GET    /{id}               -> get_report
/// GET    /{id}/download      -> download_report
/// ```
pub fn report_router() -> Router<AppState> {
    Router::new()
        .route("/", get(production_report::list_reports))
        .route(
            "/generate",
            axum::routing::post(production_report::generate_report),
        )
        .route("/templates", get(production_report::list_report_types))
        .route("/{id}", get(production_report::get_report))
        .route("/{id}/download", get(production_report::download_report))
}

/// Report schedule routes.
///
/// ```text
/// GET    /                   -> list_schedules
/// POST   /                   -> create_schedule
/// PUT    /{id}               -> update_schedule
/// DELETE /{id}               -> delete_schedule
/// ```
pub fn report_schedule_router() -> Router<AppState> {
    Router::new()
        .route(
            "/",
            get(production_report::list_schedules).post(production_report::create_schedule),
        )
        .route(
            "/{id}",
            put(production_report::update_schedule).delete(production_report::delete_schedule),
        )
}
