//! Route definitions for the avatar readiness system (PRD-107).
//!
//! Avatar readiness is merged into `/avatars`, criteria at `/readiness-criteria`,
//! and library summary into `/library/avatars`.

use axum::routing::{get, post, put};
use axum::Router;

use crate::handlers::readiness;
use crate::state::AppState;

/// Avatar-scoped readiness routes.
///
/// Merged into the existing `/avatars` router.
///
/// ```text
/// GET    /{avatar_id}/readiness               -> get_avatar_readiness
/// POST   /{avatar_id}/readiness/invalidate     -> invalidate_cache
/// ```
pub fn readiness_router() -> Router<AppState> {
    Router::new()
        .route(
            "/{avatar_id}/readiness",
            get(readiness::get_avatar_readiness),
        )
        .route(
            "/{avatar_id}/readiness/invalidate",
            post(readiness::invalidate_cache),
        )
        .route("/readiness/batch-evaluate", post(readiness::batch_evaluate))
}

/// Readiness criteria CRUD routes.
///
/// Mounted at `/readiness-criteria`.
///
/// ```text
/// GET    /           -> list_criteria
/// POST   /           -> create_criteria
/// PUT    /{id}       -> update_criteria
/// DELETE /{id}       -> delete_criteria
/// ```
pub fn readiness_criteria_router() -> Router<AppState> {
    Router::new()
        .route(
            "/",
            get(readiness::list_criteria).post(readiness::create_criteria),
        )
        .route(
            "/{id}",
            put(readiness::update_criteria).delete(readiness::delete_criteria),
        )
}

/// Library readiness summary route.
///
/// Merged into `/library/avatars`.
///
/// ```text
/// GET    /readiness-summary   -> get_readiness_summary
/// ```
pub fn readiness_library_router() -> Router<AppState> {
    Router::new().route("/readiness-summary", get(readiness::get_readiness_summary))
}
