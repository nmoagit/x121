//! Route definitions for avatar speeches (PRD-124, PRD-136).

use axum::routing::{get, post, put};
use axum::Router;

use crate::handlers::avatar_speech;
use crate::state::AppState;

/// Routes mounted at `/avatars/{avatar_id}/speeches`.
///
/// ```text
/// GET    /                    -> list_speeches
/// POST   /                    -> create_speech
/// POST   /import              -> import_speeches
/// POST   /export              -> export_speeches
/// POST   /bulk-approve        -> bulk_approve_speeches
/// POST   /deliverable         -> generate_deliverable
/// GET    /completeness        -> speech_completeness
/// PUT    /reorder             -> reorder_speeches
/// PUT    /{speech_id}         -> update_speech
/// DELETE /{speech_id}         -> delete_speech
/// PUT    /{speech_id}/status  -> update_speech_status
/// ```
pub fn router() -> Router<AppState> {
    Router::new()
        .route(
            "/",
            get(avatar_speech::list_speeches).post(avatar_speech::create_speech),
        )
        .route("/import", post(avatar_speech::import_speeches))
        .route("/export", post(avatar_speech::export_speeches))
        .route("/bulk-approve", post(avatar_speech::bulk_approve_speeches))
        .route("/deliverable", post(avatar_speech::generate_deliverable))
        .route("/completeness", get(avatar_speech::speech_completeness))
        .route("/reorder", put(avatar_speech::reorder_speeches))
        .route(
            "/{speech_id}",
            put(avatar_speech::update_speech).delete(avatar_speech::delete_speech),
        )
        .route(
            "/{speech_id}/status",
            put(avatar_speech::update_speech_status),
        )
}
