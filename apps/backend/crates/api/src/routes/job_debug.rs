//! Route definitions for the interactive job debugger (PRD-34).
//!
//! All endpoints require authentication and are scoped under `/jobs/{id}/debug`.

use axum::routing::{get, post, put};
use axum::Router;

use crate::handlers::job_debug;
use crate::state::AppState;

/// Routes merged into the `/jobs` nest for debug operations.
///
/// ```text
/// GET    /{id}/debug             -> get_debug_state
/// POST   /{id}/debug/pause       -> pause_job
/// POST   /{id}/debug/resume      -> resume_job
/// PUT    /{id}/debug/params      -> update_params
/// GET    /{id}/debug/preview     -> get_preview
/// POST   /{id}/debug/abort       -> abort_job
/// ```
pub fn debug_routes() -> Router<AppState> {
    Router::new()
        .route("/{id}/debug", get(job_debug::get_debug_state))
        .route("/{id}/debug/pause", post(job_debug::pause_job))
        .route("/{id}/debug/resume", post(job_debug::resume_job))
        .route("/{id}/debug/params", put(job_debug::update_params))
        .route("/{id}/debug/preview", get(job_debug::get_preview))
        .route("/{id}/debug/abort", post(job_debug::abort_job))
}
