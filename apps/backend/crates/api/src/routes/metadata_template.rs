//! Route definitions for metadata templates (PRD-113).
//!
//! Mounted at `/metadata-templates`.

use axum::routing::get;
use axum::Router;

use crate::handlers::metadata_template;
use crate::state::AppState;

/// Metadata template routes, intended to be nested under `/metadata-templates`.
///
/// ```text
/// GET    /                     -> list_templates
/// POST   /                     -> create_template
/// GET    /{id}                 -> get_template (with fields)
/// PUT    /{id}                 -> update_template
/// DELETE /{id}                 -> delete_template
/// GET    /{id}/fields          -> list_fields
/// POST   /{id}/fields          -> create_field
/// DELETE /{id}/fields/{field_id} -> delete_field
/// ```
pub fn router() -> Router<AppState> {
    Router::new()
        .route(
            "/",
            get(metadata_template::list_templates).post(metadata_template::create_template),
        )
        .route(
            "/{id}",
            get(metadata_template::get_template)
                .put(metadata_template::update_template)
                .delete(metadata_template::delete_template),
        )
        .route(
            "/{id}/fields",
            get(metadata_template::list_fields).post(metadata_template::create_field),
        )
        .route(
            "/{id}/fields/{field_id}",
            axum::routing::delete(metadata_template::delete_field),
        )
}
