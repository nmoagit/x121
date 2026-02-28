//! Routes for QA rulesets: profiles and scene-type overrides (PRD-91).
//!
//! QA profile CRUD routes are mounted at `/qa-profiles`.
//! Scene type QA override routes are merged into the `/scene-types` nest.

use axum::routing::{get, post};
use axum::Router;

use crate::handlers::qa_rulesets;
use crate::state::AppState;

/// QA profile routes (mounted at `/qa-profiles`).
///
/// ```text
/// GET    /           -> list_profiles
/// POST   /           -> create_profile
/// POST   /ab-test    -> ab_test_thresholds
/// GET    /{id}       -> get_profile
/// PUT    /{id}       -> update_profile
/// DELETE /{id}       -> delete_profile
/// ```
pub fn qa_profile_router() -> Router<AppState> {
    Router::new()
        .route(
            "/",
            get(qa_rulesets::list_profiles).post(qa_rulesets::create_profile),
        )
        .route("/ab-test", post(qa_rulesets::ab_test_thresholds))
        .route(
            "/{id}",
            get(qa_rulesets::get_profile)
                .put(qa_rulesets::update_profile)
                .delete(qa_rulesets::delete_profile),
        )
}

/// Scene type QA override routes (merged into `/scene-types`).
///
/// ```text
/// GET    /{id}/qa-override              -> get_scene_type_qa_override
/// PUT    /{id}/qa-override              -> upsert_scene_type_qa_override
/// DELETE /{id}/qa-override              -> delete_scene_type_qa_override
/// GET    /{id}/effective-thresholds     -> resolve_effective_thresholds
/// ```
pub fn qa_override_router() -> Router<AppState> {
    Router::new()
        .route(
            "/{id}/qa-override",
            get(qa_rulesets::get_scene_type_qa_override)
                .put(qa_rulesets::upsert_scene_type_qa_override)
                .delete(qa_rulesets::delete_scene_type_qa_override),
        )
        .route(
            "/{id}/effective-thresholds",
            get(qa_rulesets::resolve_effective_thresholds),
        )
}
