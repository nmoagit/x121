//! Route definitions for Content Branching & Exploration (PRD-50).
//!
//! ```text
//! SCENE-SCOPED (merged into /scenes):
//! GET  /{scene_id}/branches              list_branches
//! POST /{scene_id}/branch                create_branch
//!
//! BRANCH-LEVEL (mounted at /branches):
//! GET    /stale                           list_stale (?older_than_days)
//! GET    /{id}                            get_branch
//! PUT    /{id}                            update_branch
//! DELETE /{id}                            delete_branch
//! POST   /{id}/promote                    promote_branch
//! GET    /{id}/compare/{other_id}         compare_branches
//! ```

use axum::routing::{get, post};
use axum::Router;

use crate::handlers::branching;
use crate::state::AppState;

/// Scene-scoped branch routes, merged into the `/scenes` router.
pub fn scene_branch_router() -> Router<AppState> {
    Router::new()
        .route("/{scene_id}/branches", get(branching::list_branches))
        .route("/{scene_id}/branch", post(branching::create_branch))
}

/// Branch-level routes, mounted at `/branches`.
pub fn branch_router() -> Router<AppState> {
    Router::new()
        // Stale listing must come before `/{id}` to avoid path conflict.
        .route("/stale", get(branching::list_stale))
        .route(
            "/{id}",
            get(branching::get_branch)
                .put(branching::update_branch)
                .delete(branching::delete_branch),
        )
        .route("/{id}/promote", post(branching::promote_branch))
        .route(
            "/{id}/compare/{other_id}",
            get(branching::compare_branches),
        )
}
