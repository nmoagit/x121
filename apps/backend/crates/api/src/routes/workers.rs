//! Route definitions for worker pool management (PRD-46).

use axum::routing::{get, post};
use axum::Router;

use crate::handlers::workers;
use crate::state::AppState;

/// Admin routes mounted at `/admin/workers`.
///
/// All routes require the `admin` role (enforced by handler extractors).
///
/// ```text
/// GET   /              -> list_workers
/// POST  /              -> register_worker
/// GET   /stats         -> fleet_stats
/// GET   /{id}          -> get_worker
/// PUT   /{id}          -> update_worker
/// POST  /{id}/approve  -> approve_worker
/// POST  /{id}/drain    -> drain_worker
/// POST  /{id}/decommission -> decommission_worker
/// GET   /{id}/health-log   -> worker_health_log
/// ```
pub fn admin_router() -> Router<AppState> {
    Router::new()
        .route("/", get(workers::list_workers).post(workers::register_worker))
        .route("/stats", get(workers::fleet_stats))
        .route("/{id}", get(workers::get_worker).put(workers::update_worker))
        .route("/{id}/approve", post(workers::approve_worker))
        .route("/{id}/drain", post(workers::drain_worker))
        .route("/{id}/decommission", post(workers::decommission_worker))
        .route("/{id}/health-log", get(workers::worker_health_log))
}

/// Agent routes mounted at `/workers`.
///
/// These endpoints are unauthenticated by design — worker agents call them.
///
/// ```text
/// POST /register -> self_register_worker
/// ```
pub fn agent_router() -> Router<AppState> {
    Router::new().route("/register", post(workers::self_register_worker))
}
