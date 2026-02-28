//! Route definitions for VFX sidecar templates and dataset exports (PRD-40).
//!
//! Sidecar template routes are mounted at `/sidecar-templates`.
//! Dataset export routes are merged into the `/projects` nest and a top-level
//! `/datasets` nest.

use axum::routing::get;
use axum::Router;

use crate::handlers::sidecar;
use crate::state::AppState;

/// Sidecar template routes.
///
/// ```text
/// GET    /                   -> list_templates
/// POST   /                   -> create_template
/// GET    /{id}               -> get_template
/// PUT    /{id}               -> update_template
/// DELETE /{id}               -> delete_template
/// ```
pub fn sidecar_template_router() -> Router<AppState> {
    Router::new()
        .route(
            "/",
            get(sidecar::list_templates).post(sidecar::create_template),
        )
        .route(
            "/{id}",
            get(sidecar::get_template)
                .put(sidecar::update_template)
                .delete(sidecar::delete_template),
        )
}

/// Dataset export routes.
///
/// These routes are designed to be merged into the `/projects` nest:
///
/// ```text
/// POST   /{project_id}/export-dataset  -> create_export
/// GET    /{project_id}/datasets        -> list_project_exports
/// ```
///
/// And mounted at `/datasets` at the top level:
///
/// ```text
/// GET    /{id}                         -> get_export
/// ```
pub fn dataset_export_project_router() -> Router<AppState> {
    Router::new()
        .route(
            "/{project_id}/export-dataset",
            axum::routing::post(sidecar::create_export),
        )
        .route("/{project_id}/datasets", get(sidecar::list_project_exports))
}

/// Top-level dataset export router.
///
/// ```text
/// GET /{id}  -> get_export
/// ```
pub fn dataset_export_router() -> Router<AppState> {
    Router::new().route("/{id}", get(sidecar::get_export))
}
