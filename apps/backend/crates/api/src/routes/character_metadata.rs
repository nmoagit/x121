//! Route definitions for character metadata editing (PRD-66).
//!
//! Character-scoped routes are mounted at `/characters`:
//! ```text
//! GET    /{character_id}/metadata                -> get_character_metadata
//! PUT    /{character_id}/metadata                -> update_character_metadata
//! GET    /{character_id}/metadata/completeness   -> get_completeness
//! ```
//!
//! Project-scoped routes are mounted at `/projects/{project_id}/characters`:
//! ```text
//! GET    /metadata                               -> list_project_metadata
//! GET    /metadata/completeness                  -> get_project_completeness
//! GET    /metadata/csv                           -> export_metadata_csv
//! POST   /metadata/csv                           -> import_metadata_csv_preview
//! ```

use axum::routing::get;
use axum::Router;

use crate::handlers::character_metadata;
use crate::state::AppState;

/// Character-scoped metadata routes, nested under `/characters`.
pub fn character_router() -> Router<AppState> {
    Router::new()
        .route(
            "/{character_id}/metadata",
            get(character_metadata::get_character_metadata)
                .put(character_metadata::update_character_metadata),
        )
        .route(
            "/{character_id}/metadata/completeness",
            get(character_metadata::get_completeness),
        )
}

/// Project-scoped metadata routes, nested under
/// `/projects/{project_id}/characters`.
pub fn project_router() -> Router<AppState> {
    Router::new()
        .route("/metadata", get(character_metadata::list_project_metadata))
        .route(
            "/metadata/completeness",
            get(character_metadata::get_project_completeness),
        )
        .route(
            "/metadata/csv",
            get(character_metadata::export_metadata_csv)
                .post(character_metadata::import_metadata_csv_preview),
        )
}
