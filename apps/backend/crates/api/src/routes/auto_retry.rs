//! Routes for Smart Auto-Retry (PRD-71).
//!
//! - Retry policy routes are merged into the `/scene-types` nest.
//! - Retry attempt routes are merged into the `/segments` nest.

use axum::routing::{get, post};
use axum::Router;

use crate::handlers::auto_retry;
use crate::state::AppState;

/// Retry policy routes (merged into `/scene-types`).
///
/// ```text
/// GET  /{id}/retry-policy   -> get_retry_policy
/// PUT  /{id}/retry-policy   -> update_retry_policy
/// ```
pub fn retry_policy_router() -> Router<AppState> {
    Router::new().route(
        "/{id}/retry-policy",
        get(auto_retry::get_retry_policy).put(auto_retry::update_retry_policy),
    )
}

/// Retry attempt routes (merged into `/segments`).
///
/// ```text
/// GET  /{id}/retry-attempts               -> list_retry_history
/// POST /{id}/retry-attempts               -> create_retry_attempt
/// GET  /{id}/retry-attempts/{aid}         -> get_retry_attempt
/// PUT  /{id}/retry-attempts/{aid}         -> update_retry_attempt
/// POST /{id}/retry-attempts/{aid}/select  -> select_retry_attempt
/// ```
pub fn retry_attempt_router() -> Router<AppState> {
    Router::new()
        .route(
            "/{id}/retry-attempts",
            get(auto_retry::list_retry_history).post(auto_retry::create_retry_attempt),
        )
        .route(
            "/{id}/retry-attempts/{aid}",
            get(auto_retry::get_retry_attempt).put(auto_retry::update_retry_attempt),
        )
        .route(
            "/{id}/retry-attempts/{aid}/select",
            post(auto_retry::select_retry_attempt),
        )
}
