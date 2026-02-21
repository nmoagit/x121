//! Route definitions for the `/jobs` resource (PRD-07).
//!
//! All endpoints require authentication.

use axum::routing::{get, post};
use axum::Router;

use crate::handlers::jobs;
use crate::state::AppState;

/// Routes mounted at `/jobs`.
///
/// ```text
/// GET    /                -> list_jobs
/// POST   /                -> submit_job
/// GET    /{id}            -> get_job
/// POST   /{id}/cancel     -> cancel_job
/// POST   /{id}/retry      -> retry_job
/// ```
pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", get(jobs::list_jobs).post(jobs::submit_job))
        .route("/{id}", get(jobs::get_job))
        .route("/{id}/cancel", post(jobs::cancel_job))
        .route("/{id}/retry", post(jobs::retry_job))
}
