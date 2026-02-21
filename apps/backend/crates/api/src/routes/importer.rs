//! Route definitions for the folder-to-entity bulk importer (PRD-016).
//!
//! Mounted at `/import`.

use axum::routing::{get, post};
use axum::Router;

use crate::handlers::importer;
use crate::state::AppState;

/// Routes mounted at `/import`.
///
/// ```text
/// POST   /folder          -> upload_folder   (multipart)
/// GET    /{id}             -> get_import_session
/// GET    /{id}/preview     -> get_preview
/// POST   /{id}/commit      -> commit_import
/// POST   /{id}/cancel      -> cancel_import
/// ```
pub fn router() -> Router<AppState> {
    Router::new()
        .route("/folder", post(importer::upload_folder))
        .route("/{id}", get(importer::get_import_session))
        .route("/{id}/preview", get(importer::get_preview))
        .route("/{id}/commit", post(importer::commit_import))
        .route("/{id}/cancel", post(importer::cancel_import))
}
