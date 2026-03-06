//! Route definitions for the LLM refinement pipeline (PRD-125).
//!
//! Character-scoped routes (merged under `/characters`):
//! ```text
//! POST   /{character_id}/refinement                                       -> trigger_refinement
//! GET    /{character_id}/refinement-jobs                                  -> list_refinement_jobs
//! POST   /{character_id}/refinement-jobs/{job_uuid}/approve               -> approve_refinement
//! POST   /{character_id}/refinement-jobs/{job_uuid}/reject                -> reject_refinement
//! POST   /{character_id}/metadata/versions/{version_id}/clear-outdated    -> clear_outdated
//! ```
//!
//! Top-level routes (mounted directly under `/api/v1`):
//! ```text
//! GET    /refinement-jobs/{job_uuid}                                      -> get_refinement_job
//! ```

use axum::routing::{get, post};
use axum::Router;

use crate::handlers::refinement;
use crate::state::AppState;

/// Character-scoped refinement routes, merged under `/characters`.
pub fn character_refinement_router() -> Router<AppState> {
    Router::new()
        .route(
            "/{character_id}/refinement",
            post(refinement::trigger_refinement),
        )
        .route(
            "/{character_id}/refinement-jobs",
            get(refinement::list_refinement_jobs),
        )
        .route(
            "/{character_id}/refinement-jobs/{job_uuid}/approve",
            post(refinement::approve_refinement),
        )
        .route(
            "/{character_id}/refinement-jobs/{job_uuid}/reject",
            post(refinement::reject_refinement),
        )
        .route(
            "/{character_id}/metadata/versions/{version_id}/clear-outdated",
            post(refinement::clear_outdated),
        )
}

/// Top-level refinement job lookup by UUID.
pub fn refinement_job_router() -> Router<AppState> {
    Router::new().route("/{job_uuid}", get(refinement::get_refinement_job))
}
