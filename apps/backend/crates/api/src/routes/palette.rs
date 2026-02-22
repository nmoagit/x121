//! Route definitions for command palette and recent items (PRD-31).
//!
//! Recent items are mounted at `/user/recent-items` by `api_routes()`.
//! Palette search is mounted at `/search/palette` by `api_routes()`.

use axum::routing::get;
use axum::Router;

use crate::handlers::palette;
use crate::state::AppState;

/// Recent items routes.
///
/// ```text
/// GET    /           -> get_recent_items (list recent items)
/// POST   /           -> record_access (record entity access)
/// DELETE /           -> clear_recent (clear all recent items)
/// ```
pub fn recent_items_router() -> Router<AppState> {
    Router::new().route(
        "/",
        get(palette::get_recent_items)
            .post(palette::record_access)
            .delete(palette::clear_recent),
    )
}

/// Palette search route.
///
/// ```text
/// GET    /           -> palette_search (search palette)
/// ```
pub fn search_router() -> Router<AppState> {
    Router::new().route("/", get(palette::palette_search))
}
