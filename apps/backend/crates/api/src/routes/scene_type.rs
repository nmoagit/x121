//! Route definitions for studio-level scene types.
//!
//! Project-scoped scene type routes are mounted via [`super::project::router`].
//! This module only provides the studio-level `/scene-types` router.

use axum::routing::{get, post};
use axum::Router;

use crate::handlers::scene_type;
use crate::state::AppState;

/// Routes mounted at `/scene-types` for studio-level scene types.
///
/// ```text
/// GET    /                                         -> list_studio_level
/// POST   /                                         -> create_studio
/// GET    /{id}                                     -> get_by_id
/// PUT    /{id}                                     -> update
/// DELETE /{id}                                     -> delete
/// GET    /{id}/preview-prompt/{character_id}       -> preview_prompt (PRD-23)
/// POST   /matrix                                   -> generate_matrix (PRD-23)
/// POST   /validate                                 -> validate_scene_type_config (PRD-23)
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
        .route(
            "/{id}/preview-prompt/{character_id}",
            get(scene_type::preview_prompt),
        )
        .route("/matrix", post(scene_type::generate_matrix))
        .route("/validate", post(scene_type::validate_scene_type_config))
}
