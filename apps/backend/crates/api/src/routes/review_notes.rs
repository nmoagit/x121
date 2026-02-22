//! Route definitions for collaborative review notes and tags (PRD-38).
//!
//! Segment-scoped note routes are merged into the `/segments` route group.
//! Tag management routes are registered as a standalone `/review-tags` group.

use axum::routing::{delete, get, post, put};
use axum::Router;

use crate::handlers::review_notes;
use crate::state::AppState;

/// Segment-scoped review note routes, merged into `/segments`.
///
/// ```text
/// GET    /{id}/notes                          list_notes
/// POST   /{id}/notes                          create_note
/// PUT    /{id}/notes/{note_id}                update_note
/// DELETE /{id}/notes/{note_id}                delete_note
/// PUT    /{id}/notes/{note_id}/resolve        resolve_note
/// POST   /{id}/notes/{note_id}/tags           assign_note_tags
/// DELETE /{id}/notes/{note_id}/tags/{tag_id}  remove_note_tag
/// ```
pub fn segment_notes_router() -> Router<AppState> {
    Router::new()
        .route("/{id}/notes", get(review_notes::list_notes).post(review_notes::create_note))
        .route(
            "/{id}/notes/{note_id}",
            put(review_notes::update_note).delete(review_notes::delete_note),
        )
        .route(
            "/{id}/notes/{note_id}/resolve",
            put(review_notes::resolve_note),
        )
        .route(
            "/{id}/notes/{note_id}/tags",
            post(review_notes::assign_note_tags),
        )
        .route(
            "/{id}/notes/{note_id}/tags/{tag_id}",
            delete(review_notes::remove_note_tag),
        )
}

/// Review tag management routes, registered as `/review-tags`.
///
/// ```text
/// GET    /                                    list_tags
/// POST   /                                    create_tag
/// DELETE /{id}                                delete_tag
/// ```
pub fn review_tags_router() -> Router<AppState> {
    Router::new()
        .route("/", get(review_notes::list_tags).post(review_notes::create_tag))
        .route("/{id}", delete(review_notes::delete_tag))
}
