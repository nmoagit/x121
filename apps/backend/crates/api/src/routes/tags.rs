//! Route definitions for the tag system (PRD-47).
//!
//! Two routers are provided:
//! - `router()` for tag-specific routes mounted at `/tags`
//! - `entity_tags_router()` for entity-scoped tag routes mounted at `/entities`

use axum::routing::{delete, get, post, put};
use axum::Router;

use crate::handlers::tags;
use crate::state::AppState;

/// Tag-specific routes mounted at `/tags`.
///
/// ```text
/// GET    /                  -> list_tags
/// GET    /suggest           -> suggest_tags
/// PUT    /{id}              -> update_tag
/// DELETE /{id}              -> delete_tag (admin only)
/// POST   /bulk-apply        -> bulk_apply
/// POST   /bulk-remove       -> bulk_remove
/// ```
pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", get(tags::list_tags))
        .route("/suggest", get(tags::suggest_tags))
        .route("/{id}", put(tags::update_tag).delete(tags::delete_tag))
        .route("/bulk-apply", post(tags::bulk_apply))
        .route("/bulk-remove", post(tags::bulk_remove))
}

/// Entity-scoped tag routes mounted at `/entities`.
///
/// ```text
/// GET    /{entity_type}/{entity_id}/tags            -> get_entity_tags
/// POST   /{entity_type}/{entity_id}/tags            -> apply_entity_tags
/// DELETE /{entity_type}/{entity_id}/tags/{tag_id}   -> remove_entity_tag
/// ```
pub fn entity_tags_router() -> Router<AppState> {
    Router::new()
        .route(
            "/{entity_type}/{entity_id}/tags",
            get(tags::get_entity_tags).post(tags::apply_entity_tags),
        )
        .route(
            "/{entity_type}/{entity_id}/tags/{tag_id}",
            delete(tags::remove_entity_tag),
        )
}
