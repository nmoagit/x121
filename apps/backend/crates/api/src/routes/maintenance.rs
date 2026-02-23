//! Route definitions for Bulk Data Maintenance (PRD-18).
//!
//! Mounted at `/admin/maintenance` by `api_routes()`.

use axum::routing::{get, post};
use axum::Router;

use crate::handlers::maintenance;
use crate::state::AppState;

/// Bulk data maintenance routes.
///
/// ```text
/// POST   /find-replace/preview     -> preview_find_replace
/// POST   /find-replace/{id}/execute -> execute_find_replace
/// POST   /repath/preview            -> preview_repath
/// POST   /repath/{id}/execute       -> execute_repath
/// POST   /{id}/undo                 -> undo_operation
/// GET    /history                   -> list_operations (?limit, offset, operation_type, status)
/// GET    /{id}                      -> get_operation
/// ```
pub fn maintenance_router() -> Router<AppState> {
    Router::new()
        .route(
            "/find-replace/preview",
            post(maintenance::preview_find_replace),
        )
        .route(
            "/find-replace/{id}/execute",
            post(maintenance::execute_find_replace),
        )
        .route("/repath/preview", post(maintenance::preview_repath))
        .route("/repath/{id}/execute", post(maintenance::execute_repath))
        .route("/{id}/undo", post(maintenance::undo_operation))
        .route("/history", get(maintenance::list_operations))
        .route("/{id}", get(maintenance::get_operation))
}
