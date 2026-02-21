//! Route definitions for configuration export/import (PRD-44).
//!
//! Named `config_management` to avoid collision with `api::config` (server
//! configuration module). Mounted at `/admin/config` by `api_routes()`.

use axum::routing::post;
use axum::Router;

use crate::handlers::config_export;
use crate::state::AppState;

/// Config management routes (admin only).
///
/// ```text
/// POST   /export            -> export_config
/// POST   /validate          -> validate_config
/// POST   /import            -> import_config
/// ```
pub fn router() -> Router<AppState> {
    Router::new()
        .route("/export", post(config_export::export_config))
        .route("/validate", post(config_export::validate_config))
        .route("/import", post(config_export::import_config))
}
