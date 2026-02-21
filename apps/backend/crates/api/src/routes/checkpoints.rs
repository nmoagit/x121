//! Route definitions for pipeline checkpoints & diagnostics (PRD-28).
//!
//! All endpoints require authentication and are scoped under `/jobs/{id}/...`.

use axum::routing::{get, post};
use axum::Router;

use crate::handlers::checkpoints;
use crate::state::AppState;

/// Routes mounted under `/jobs/{id}` for checkpoint and diagnostics operations.
///
/// ```text
/// GET    /{id}/checkpoints                -> list_checkpoints
/// GET    /{id}/checkpoints/{checkpoint_id} -> get_checkpoint
/// POST   /{id}/resume-from-checkpoint     -> resume_from_checkpoint
/// GET    /{id}/diagnostics                -> get_failure_diagnostics
/// ```
pub fn checkpoint_routes() -> Router<AppState> {
    Router::new()
        .route("/{id}/checkpoints", get(checkpoints::list_checkpoints))
        .route(
            "/{id}/checkpoints/{checkpoint_id}",
            get(checkpoints::get_checkpoint),
        )
        .route(
            "/{id}/resume-from-checkpoint",
            post(checkpoints::resume_from_checkpoint),
        )
        .route("/{id}/diagnostics", get(checkpoints::get_failure_diagnostics))
}
