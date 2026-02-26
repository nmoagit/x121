//! Route definitions for external & tiered storage (PRD-48).
//!
//! Mounted at `/admin/storage` by `api_routes()`.

use axum::routing::{get, post, put};
use axum::Router;

use crate::handlers::storage;
use crate::state::AppState;

/// Storage admin routes.
///
/// ```text
/// GET    /backends                  -> list_backends
/// POST   /backends                  -> create_backend
/// PUT    /backends/{id}             -> update_backend
/// POST   /backends/{id}/decommission -> decommission_backend
/// GET    /policies                  -> list_policies
/// POST   /policies                  -> create_policy
/// POST   /policies/simulate         -> simulate_policy
/// POST   /migrations                -> start_migration
/// GET    /migrations/{id}           -> get_migration
/// POST   /migrations/{id}/rollback  -> rollback_migration
/// ```
pub fn router() -> Router<AppState> {
    Router::new()
        .route(
            "/backends",
            get(storage::list_backends).post(storage::create_backend),
        )
        .route("/backends/{id}", put(storage::update_backend))
        .route(
            "/backends/{id}/decommission",
            post(storage::decommission_backend),
        )
        .route(
            "/policies",
            get(storage::list_policies).post(storage::create_policy),
        )
        .route("/policies/simulate", post(storage::simulate_policy))
        .route("/migrations", post(storage::start_migration))
        .route("/migrations/{id}", get(storage::get_migration))
        .route(
            "/migrations/{id}/rollback",
            post(storage::rollback_migration),
        )
}
