//! Route definitions for the `/trash` resource.

use axum::routing::{delete, get, post};
use axum::Router;

use crate::handlers::trash;
use crate::state::AppState;

/// Routes mounted at `/trash`.
///
/// ```text
/// GET    /                              -> list_trashed  (?type=entity_type)
/// DELETE /purge                         -> purge_all
/// GET    /purge-preview                 -> purge_preview
/// POST   /{entity_type}/{id}/restore    -> restore
/// DELETE /{entity_type}/{id}/purge      -> purge_one
/// ```
pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", get(trash::list_trashed))
        .route("/purge", delete(trash::purge_all))
        .route("/purge-preview", get(trash::purge_preview))
        .route("/{entity_type}/{id}/restore", post(trash::restore))
        .route("/{entity_type}/{id}/purge", delete(trash::purge_one))
}
