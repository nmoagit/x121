//! Route definitions for studio-level scene types.
//!
//! Project-scoped scene type routes are mounted via [`super::project::router`].
//! This module only provides the studio-level `/scene-types` router.

use axum::routing::get;
use axum::Router;

use crate::handlers::scene_type;
use crate::state::AppState;

/// Routes mounted at `/scene-types` for studio-level scene types.
///
/// ```text
/// GET    /       -> list_studio_level
/// POST   /       -> create_studio
/// GET    /{id}   -> get_by_id
/// PUT    /{id}   -> update
/// DELETE /{id}   -> delete
/// ```
pub fn studio_router() -> Router<AppState> {
    Router::new()
        .route(
            "/",
            get(scene_type::list_studio_level).post(scene_type::create_studio),
        )
        .route(
            "/{id}",
            get(scene_type::get_by_id)
                .put(scene_type::update)
                .delete(scene_type::delete),
        )
}
