//! Route definitions for character speeches (PRD-124, PRD-136).

use axum::routing::{get, post, put};
use axum::Router;

use crate::handlers::character_speech;
use crate::state::AppState;

/// Routes mounted at `/characters/{character_id}/speeches`.
///
/// ```text
/// GET    /                    -> list_speeches
/// POST   /                    -> create_speech
/// POST   /import              -> import_speeches
/// POST   /export              -> export_speeches
/// POST   /bulk-approve        -> bulk_approve_speeches
/// PUT    /reorder             -> reorder_speeches
/// PUT    /{speech_id}         -> update_speech
/// DELETE /{speech_id}         -> delete_speech
/// PUT    /{speech_id}/status  -> update_speech_status
/// ```
pub fn router() -> Router<AppState> {
    Router::new()
        .route(
            "/",
            get(character_speech::list_speeches).post(character_speech::create_speech),
        )
        .route("/import", post(character_speech::import_speeches))
        .route("/export", post(character_speech::export_speeches))
        .route(
            "/bulk-approve",
            post(character_speech::bulk_approve_speeches),
        )
        .route("/reorder", put(character_speech::reorder_speeches))
        .route(
            "/{speech_id}",
            put(character_speech::update_speech).delete(character_speech::delete_speech),
        )
        .route(
            "/{speech_id}/status",
            put(character_speech::update_speech_status),
        )
}
