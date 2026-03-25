//! Route definitions for bulk export jobs (PRD-151).
//!
//! ```text
//! POST   /                   create_export
//! GET    /{id}               get_export
//! GET    /{id}/download/{part}  download_export_part
//! ```

use axum::routing::get;
use axum::Router;

use crate::handlers::export;
use crate::state::AppState;

/// Export job routes — mounted at `/exports`.
pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", axum::routing::post(export::create_export))
        .route("/{id}", get(export::get_export))
        .route("/{id}/download/{part}", get(export::download_export_part))
}
