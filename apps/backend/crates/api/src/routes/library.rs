//! Route definitions for the character library (PRD-60).
//!
//! Mounted at `/library/characters` in the API route tree.
//!
//! ```text
//! GET    /                              list_library_characters
//! POST   /                              create_library_character
//! GET    /{id}                          get_library_character
//! PUT    /{id}                          update_library_character
//! DELETE /{id}                          delete_library_character
//! GET    /{id}/usage                    get_library_usage
//! POST   /{id}/import                   import_to_project
//! GET    /projects/{project_id}/links   list_project_links
//! PUT    /links/{link_id}               update_link_fields
//! DELETE /links/{link_id}               delete_link
//! ```

use axum::routing::{get, post, put};
use axum::Router;

use crate::handlers::library;
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route(
            "/",
            get(library::list_library_characters).post(library::create_library_character),
        )
        .route(
            "/{id}",
            get(library::get_library_character)
                .put(library::update_library_character)
                .delete(library::delete_library_character),
        )
        .route("/{id}/usage", get(library::get_library_usage))
        .route("/{id}/import", post(library::import_to_project))
        .route(
            "/projects/{project_id}/links",
            get(library::list_project_links),
        )
        .route(
            "/links/{link_id}",
            put(library::update_link_fields).delete(library::delete_link),
        )
}
