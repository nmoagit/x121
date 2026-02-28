//! Route definitions for shareable preview links (PRD-84).
//!
//! Two routers are provided:
//! - `authenticated_router()` for link management (requires auth)
//! - `public_router()` for external reviewers (no auth)

use axum::routing::{get, post};
use axum::Router;

use crate::handlers::shared_link;
use crate::state::AppState;

/// Authenticated shared link management routes.
///
/// Nested under `/api/v1/shared-links`.
///
/// ```text
/// POST   /                  create_link
/// GET    /                  list_links
/// GET    /{id}              get_link
/// DELETE /{id}              revoke_link
/// POST   /bulk-revoke       bulk_revoke_links
/// GET    /{id}/activity     get_link_activity
/// ```
pub fn authenticated_router() -> Router<AppState> {
    Router::new()
        .route(
            "/",
            post(shared_link::create_link).get(shared_link::list_links),
        )
        .route(
            "/{id}",
            get(shared_link::get_link).delete(shared_link::revoke_link),
        )
        .route("/bulk-revoke", post(shared_link::bulk_revoke_links))
        .route("/{id}/activity", get(shared_link::get_link_activity))
}

/// Public external review routes (no authentication required).
///
/// Nested under `/api/v1/review`.
///
/// ```text
/// GET    /{token}                  validate_token
/// POST   /{token}/verify-password  verify_password
/// POST   /{token}/feedback         submit_feedback
/// ```
pub fn public_router() -> Router<AppState> {
    Router::new()
        .route("/{token}", get(shared_link::validate_token))
        .route(
            "/{token}/verify-password",
            post(shared_link::verify_password),
        )
        .route("/{token}/feedback", post(shared_link::submit_feedback))
}
