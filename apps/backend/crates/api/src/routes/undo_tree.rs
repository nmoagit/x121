//! Route definitions for undo/redo tree persistence (PRD-51).
//!
//! All endpoints require authentication via `AuthUser` extractor.

use axum::routing::get;
use axum::Router;

use crate::handlers::undo_tree;
use crate::state::AppState;

/// Per-entity undo tree routes mounted at `/user/undo-tree`.
///
/// ```text
/// GET    /{entity_type}/{entity_id}  -> get_tree
/// PUT    /{entity_type}/{entity_id}  -> save_tree
/// DELETE /{entity_type}/{entity_id}  -> delete_tree
/// ```
pub fn router() -> Router<AppState> {
    Router::new().route(
        "/{entity_type}/{entity_id}",
        get(undo_tree::get_tree)
            .put(undo_tree::save_tree)
            .delete(undo_tree::delete_tree),
    )
}

/// User-level undo tree listing routes mounted at `/user/undo-trees`.
///
/// ```text
/// GET /  -> list_trees
/// ```
pub fn user_router() -> Router<AppState> {
    Router::new().route("/", get(undo_tree::list_trees))
}
