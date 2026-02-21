//! Route definitions for real-time collaboration (PRD-11).
//!
//! All endpoints require authentication via `AuthUser` extractor.

use axum::routing::{get, post};
use axum::Router;

use crate::handlers::collaboration;
use crate::state::AppState;

/// Collaboration routes mounted at `/collaboration`.
///
/// ```text
/// POST /locks/acquire                          -> acquire_lock
/// POST /locks/release                          -> release_lock
/// POST /locks/extend                           -> extend_lock
/// GET  /locks/{entity_type}/{entity_id}        -> get_lock_status
/// GET  /presence/{entity_type}/{entity_id}     -> get_presence
/// ```
pub fn router() -> Router<AppState> {
    Router::new()
        .route("/locks/acquire", post(collaboration::acquire_lock))
        .route("/locks/release", post(collaboration::release_lock))
        .route("/locks/extend", post(collaboration::extend_lock))
        .route(
            "/locks/{entity_type}/{entity_id}",
            get(collaboration::get_lock_status),
        )
        .route(
            "/presence/{entity_type}/{entity_id}",
            get(collaboration::get_presence),
        )
}
