//! Route definitions for the `/jobs` resource (PRD-07, extended by PRD-08).
//!
//! All endpoints require authentication.

use axum::routing::{get, post};
use axum::Router;

use crate::handlers::jobs;
use crate::state::AppState;

/// Routes mounted at `/jobs`.
///
/// ```text
/// GET    /                    -> list_jobs
/// POST   /                    -> submit_job
/// GET    /{id}                -> get_job
/// POST   /{id}/cancel         -> cancel_job
/// POST   /{id}/retry          -> retry_job
/// POST   /{id}/pause          -> pause_job       (PRD-08)
/// POST   /{id}/resume         -> resume_job      (PRD-08)
/// GET    /{id}/transitions    -> get_job_transitions (PRD-08)
/// ```
pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", get(jobs::list_jobs).post(jobs::submit_job))
        .route("/{id}", get(jobs::get_job))
        .route("/{id}/cancel", post(jobs::cancel_job))
        .route("/{id}/retry", post(jobs::retry_job))
        .route("/{id}/pause", post(jobs::pause_job))
        .route("/{id}/resume", post(jobs::resume_job))
        .route("/{id}/transitions", get(jobs::get_job_transitions))
}
