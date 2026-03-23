//! Route definitions for avatar metadata editing (PRD-66).
//!
//! Avatar-scoped routes are mounted at `/avatars`:
//! ```text
//! GET    /{avatar_id}/metadata                -> get_avatar_metadata
//! PUT    /{avatar_id}/metadata                -> update_avatar_metadata
//! GET    /{avatar_id}/metadata/completeness   -> get_completeness
//! ```
//!
//! Project-scoped routes are mounted at `/projects/{project_id}/avatars`:
//! ```text
//! GET    /metadata                               -> list_project_metadata
//! GET    /metadata/completeness                  -> get_project_completeness
//! GET    /metadata/csv                           -> export_metadata_csv
//! POST   /metadata/csv                           -> import_metadata_csv_preview
//! ```

use axum::routing::get;
use axum::Router;

use crate::handlers::avatar_metadata;
use crate::state::AppState;

/// Avatar-scoped metadata routes, nested under `/avatars`.
pub fn avatar_router() -> Router<AppState> {
    Router::new()
        .route(
            "/{avatar_id}/metadata",
            get(avatar_metadata::get_avatar_metadata).put(avatar_metadata::update_avatar_metadata),
        )
        .route(
            "/{avatar_id}/metadata/completeness",
            get(avatar_metadata::get_completeness),
        )
        .route(
            "/{avatar_id}/metadata/template",
            get(avatar_metadata::get_metadata_template),
        )
}

/// Project-scoped metadata routes, nested under
/// `/projects/{project_id}/avatars`.
pub fn project_router() -> Router<AppState> {
    Router::new()
        .route("/metadata", get(avatar_metadata::list_project_metadata))
        .route(
            "/metadata/completeness",
            get(avatar_metadata::get_project_completeness),
        )
        .route(
            "/metadata/csv",
            get(avatar_metadata::export_metadata_csv)
                .post(avatar_metadata::import_metadata_csv_preview),
        )
}
