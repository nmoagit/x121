//! Route definitions for the character ingest pipeline (PRD-113).
//!
//! These routes are nested under `/projects/{project_id}/ingest`.

use axum::routing::{get, post};
use axum::Router;

use crate::handlers::character_ingest;
use crate::state::AppState;

/// Ingest routes mounted at `/{project_id}/ingest`.
///
/// ```text
/// GET    /                                     -> list_sessions
/// POST   /text                                 -> ingest_from_text
/// GET    /{session_id}                         -> get_session
/// DELETE /{session_id}                         -> cancel_session
/// GET    /{session_id}/entries                  -> list_entries
/// PUT    /{session_id}/entries/{entry_id}       -> update_entry
/// POST   /{session_id}/validate                 -> validate_session
/// POST   /{session_id}/generate-metadata        -> generate_metadata
/// POST   /{session_id}/confirm                  -> confirm_import
/// ```
pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", get(character_ingest::list_sessions))
        .route("/text", post(character_ingest::ingest_from_text))
        .route(
            "/{session_id}",
            get(character_ingest::get_session).delete(character_ingest::cancel_session),
        )
        .route("/{session_id}/entries", get(character_ingest::list_entries))
        .route(
            "/{session_id}/entries/{entry_id}",
            axum::routing::put(character_ingest::update_entry),
        )
        .route(
            "/{session_id}/validate",
            post(character_ingest::validate_session),
        )
        .route(
            "/{session_id}/generate-metadata",
            post(character_ingest::generate_metadata),
        )
        .route(
            "/{session_id}/confirm",
            post(character_ingest::confirm_import),
        )
}
