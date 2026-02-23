//! Route definitions for the character readiness system (PRD-107).
//!
//! Character readiness is merged into `/characters`, criteria at `/readiness-criteria`,
//! and library summary into `/library/characters`.

use axum::routing::{get, post, put};
use axum::Router;

use crate::handlers::readiness;
use crate::state::AppState;

/// Character-scoped readiness routes.
///
/// Merged into the existing `/characters` router.
///
/// ```text
/// GET    /{character_id}/readiness               -> get_character_readiness
/// POST   /{character_id}/readiness/invalidate     -> invalidate_cache
/// ```
pub fn readiness_router() -> Router<AppState> {
    Router::new()
        .route(
            "/{character_id}/readiness",
            get(readiness::get_character_readiness),
        )
        .route(
            "/{character_id}/readiness/invalidate",
            post(readiness::invalidate_cache),
        )
        .route(
            "/readiness/batch-evaluate",
            post(readiness::batch_evaluate),
        )
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
/// Merged into `/library/characters`.
///
/// ```text
/// GET    /readiness-summary   -> get_readiness_summary
/// ```
pub fn readiness_library_router() -> Router<AppState> {
    Router::new().route(
        "/readiness-summary",
        get(readiness::get_readiness_summary),
    )
}
