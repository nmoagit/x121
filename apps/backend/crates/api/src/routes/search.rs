//! Route definitions for search & discovery (PRD-20).
//!
//! Mounted at `/search` in the API route tree.

use axum::routing::{delete, get, post};
use axum::Router;

use crate::handlers::search;
use crate::state::AppState;

/// Search routes mounted at `/search`.
///
/// ```text
/// GET    /                      -> unified_search
/// GET    /typeahead              -> typeahead
/// POST   /similar                -> visual_similarity
/// POST   /saved                  -> create_saved_search
/// GET    /saved                  -> list_saved_searches
/// DELETE /saved/{id}             -> delete_saved_search
/// GET    /saved/{id}/execute     -> execute_saved_search
/// ```
pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", get(search::unified_search))
        .route("/typeahead", get(search::typeahead))
        .route("/similar", post(search::visual_similarity))
        .route(
            "/saved",
            post(search::create_saved_search).get(search::list_saved_searches),
        )
        .route("/saved/{id}", delete(search::delete_saved_search))
        .route("/saved/{id}/execute", get(search::execute_saved_search))
}
