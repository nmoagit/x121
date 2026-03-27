//! Route definitions for the unified directory scanner (PRD-155).
//!
//! Mounted at `/directory-scan`.

use axum::routing::post;
use axum::Router;

use crate::handlers::directory_scan;
use crate::state::AppState;

/// Routes mounted at `/directory-scan`.
///
/// ```text
/// POST   /           -> scan       (classify files, detect conflicts)
/// POST   /import     -> import     (selectively import files)
/// ```
pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", post(directory_scan::scan))
        .route("/import", post(directory_scan::import))
}
