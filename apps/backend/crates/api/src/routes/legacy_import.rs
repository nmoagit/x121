//! Route definitions for the legacy data import toolkit (PRD-86).
//!
//! Mounted at `/admin/import/legacy` by `api_routes()`.

use axum::routing::{get, post};
use axum::Router;

use crate::handlers::legacy_import;
use crate::state::AppState;

/// Legacy import routes.
///
/// ```text
/// GET    /runs                      -> list_runs (?project_id, limit, offset)
/// POST   /runs                      -> create_run
/// GET    /runs/{id}                 -> get_run
/// POST   /runs/{id}/scan            -> scan_folder
/// POST   /runs/{id}/preview         -> preview_import
/// POST   /runs/{id}/commit          -> commit_import
/// GET    /runs/{id}/report          -> get_run_report
/// GET    /runs/{id}/gap-report      -> get_gap_report
/// POST   /runs/{id}/csv             -> import_csv
/// GET    /runs/{id}/entities        -> list_entity_logs
/// ```
pub fn legacy_import_router() -> Router<AppState> {
    Router::new()
        .route(
            "/runs",
            get(legacy_import::list_runs).post(legacy_import::create_run),
        )
        .route("/runs/{id}", get(legacy_import::get_run))
        .route("/runs/{id}/scan", post(legacy_import::scan_folder))
        .route("/runs/{id}/preview", post(legacy_import::preview_import))
        .route("/runs/{id}/commit", post(legacy_import::commit_import))
        .route("/runs/{id}/report", get(legacy_import::get_run_report))
        .route("/runs/{id}/gap-report", get(legacy_import::get_gap_report))
        .route("/runs/{id}/csv", post(legacy_import::import_csv))
        .route("/runs/{id}/entities", get(legacy_import::list_entity_logs))
}
