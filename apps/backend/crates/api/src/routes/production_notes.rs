//! Route definitions for the production notes system (PRD-95).
//!
//! Mounted at `/notes` and `/note-categories` by `api_routes()`.

use axum::routing::{get, patch, put};
use axum::Router;

use crate::handlers::production_notes;
use crate::state::AppState;

/// Note routes.
///
/// ```text
/// GET    /                   -> list_notes (?entity_type, entity_id, limit, offset)
/// POST   /                   -> create_note
/// GET    /search             -> search_notes (?q, entity_type)
/// GET    /pinned             -> list_pinned (?entity_type, entity_id)
/// GET    /{id}               -> get_note
/// PUT    /{id}               -> update_note
/// DELETE /{id}               -> delete_note
/// PATCH  /{id}/pin           -> toggle_pin
/// PATCH  /{id}/resolve       -> resolve_note
/// PATCH  /{id}/unresolve     -> unresolve_note
/// GET    /{id}/thread        -> list_thread
/// ```
pub fn notes_router() -> Router<AppState> {
    Router::new()
        .route(
            "/",
            get(production_notes::list_notes).post(production_notes::create_note),
        )
        .route("/search", get(production_notes::search_notes))
        .route("/pinned", get(production_notes::list_pinned))
        .route(
            "/{id}",
            get(production_notes::get_note)
                .put(production_notes::update_note)
                .delete(production_notes::delete_note),
        )
        .route("/{id}/pin", patch(production_notes::toggle_pin))
        .route("/{id}/resolve", patch(production_notes::resolve_note))
        .route("/{id}/unresolve", patch(production_notes::unresolve_note))
        .route("/{id}/thread", get(production_notes::list_thread))
}

/// Note category routes.
///
/// ```text
/// GET    /                   -> list_categories
/// POST   /                   -> create_category
/// PUT    /{id}               -> update_category
/// DELETE /{id}               -> delete_category
/// ```
pub fn note_categories_router() -> Router<AppState> {
    Router::new()
        .route(
            "/",
            get(production_notes::list_categories).post(production_notes::create_category),
        )
        .route(
            "/{id}",
            put(production_notes::update_category).delete(production_notes::delete_category),
        )
}
