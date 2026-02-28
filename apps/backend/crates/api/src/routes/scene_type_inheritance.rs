//! Routes for scene type inheritance, overrides, and mixins (PRD-100).
//!
//! Scene type inheritance routes are merged into the `/scene-types` nest.
//! Mixin CRUD routes are mounted at `/mixins`.

use axum::routing::{delete, get, post};
use axum::Router;

use crate::handlers::scene_type_inheritance;
use crate::state::AppState;

/// Scene type inheritance routes (merged into `/scene-types`).
///
/// ```text
/// POST   /{id}/children                      -> create_child
/// GET    /{id}/children                       -> list_children
/// GET    /{id}/effective-config               -> effective_config
/// GET    /{id}/cascade-preview/{field}        -> cascade_preview
/// GET    /{id}/overrides                      -> list_overrides
/// PUT    /{id}/overrides                      -> upsert_override
/// DELETE /{id}/overrides/{field}              -> delete_override
/// GET    /{id}/mixins                         -> list_scene_type_mixins
/// POST   /{id}/mixins                         -> apply_mixin
/// DELETE /{id}/mixins/{mixin_id}              -> remove_mixin
/// ```
pub fn inheritance_router() -> Router<AppState> {
    Router::new()
        .route(
            "/{id}/children",
            post(scene_type_inheritance::create_child).get(scene_type_inheritance::list_children),
        )
        .route(
            "/{id}/effective-config",
            get(scene_type_inheritance::effective_config),
        )
        .route(
            "/{id}/cascade-preview/{field}",
            get(scene_type_inheritance::cascade_preview),
        )
        .route(
            "/{id}/overrides",
            get(scene_type_inheritance::list_overrides)
                .put(scene_type_inheritance::upsert_override),
        )
        .route(
            "/{id}/overrides/{field}",
            delete(scene_type_inheritance::delete_override),
        )
        .route(
            "/{id}/mixins",
            get(scene_type_inheritance::list_scene_type_mixins)
                .post(scene_type_inheritance::apply_mixin),
        )
        .route(
            "/{id}/mixins/{mixin_id}",
            delete(scene_type_inheritance::remove_mixin),
        )
}

/// Mixin CRUD routes (mounted at `/mixins`).
///
/// ```text
/// GET    /           -> list_mixins
/// POST   /           -> create_mixin
/// GET    /{id}       -> get_mixin
/// PUT    /{id}       -> update_mixin
/// DELETE /{id}       -> delete_mixin
/// ```
pub fn mixin_router() -> Router<AppState> {
    Router::new()
        .route(
            "/",
            get(scene_type_inheritance::list_mixins).post(scene_type_inheritance::create_mixin),
        )
        .route(
            "/{id}",
            get(scene_type_inheritance::get_mixin)
                .put(scene_type_inheritance::update_mixin)
                .delete(scene_type_inheritance::delete_mixin),
        )
}
