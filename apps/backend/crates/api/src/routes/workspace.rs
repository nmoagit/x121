//! Route definitions for workspace state persistence (PRD-04).
//!
//! All endpoints require authentication via `AuthUser` extractor.

use axum::routing::{get, post};
use axum::Router;

use crate::handlers::workspace;
use crate::state::AppState;

/// Workspace routes mounted at `/workspace`.
///
/// ```text
/// GET  /                                -> get_workspace
/// PUT  /                                -> update_workspace
/// POST /reset                           -> reset_workspace
/// GET  /undo/{entity_type}/{entity_id}  -> get_undo_snapshot
/// PUT  /undo/{entity_type}/{entity_id}  -> save_undo_snapshot
/// ```
pub fn router() -> Router<AppState> {
    Router::new()
        .route(
            "/",
            get(workspace::get_workspace).put(workspace::update_workspace),
        )
        .route("/reset", post(workspace::reset_workspace))
        .route(
            "/undo/{entity_type}/{entity_id}",
            get(workspace::get_undo_snapshot).put(workspace::save_undo_snapshot),
        )
}
