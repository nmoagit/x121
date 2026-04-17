//! Route definitions for the unified directory scanner (PRD-155).
//!
//! Mounted at `/directory-scan`.

use axum::routing::{get, post};
use axum::Router;

use crate::handlers::{directory_scan, directory_scan_import};
use crate::state::AppState;

/// Routes mounted at `/directory-scan`.
///
/// ```text
/// POST   /               -> scan              (classify files, detect conflicts)
/// POST   /import         -> import            (selectively import files)
/// POST   /import-assets  -> import_assets     (SSE multi-type import, PRD-165)
/// GET    /sources        -> list_scan_sources (non-secret S3 sources, PRD-165)
/// ```
pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", post(directory_scan::scan))
        .route("/import", post(directory_scan::import))
        .route("/import-assets", post(directory_scan_import::import_assets))
        .route("/sources", get(directory_scan::list_scan_sources))
}
