//! Route definitions for character-scoped sub-resources.
//!
//! These routes are mounted at `/characters` and provide access to
//! source images, derived images, image variants, and scenes that
//! belong to a specific character.

use axum::routing::get;
use axum::Router;

use crate::handlers::{derived_image, image_variant, scene, source_image};
use crate::state::AppState;

/// Routes mounted at `/characters`.
///
/// ```text
/// GET    /{character_id}/source-images           -> list_by_character
/// POST   /{character_id}/source-images           -> create
/// GET    /{character_id}/source-images/{id}      -> get_by_id
/// PUT    /{character_id}/source-images/{id}      -> update
/// DELETE /{character_id}/source-images/{id}      -> delete
///
/// GET    /{character_id}/derived-images           -> list_by_character
/// POST   /{character_id}/derived-images           -> create
/// GET    /{character_id}/derived-images/{id}      -> get_by_id
/// PUT    /{character_id}/derived-images/{id}      -> update
/// DELETE /{character_id}/derived-images/{id}      -> delete
///
/// GET    /{character_id}/image-variants           -> list_by_character
/// POST   /{character_id}/image-variants           -> create
/// GET    /{character_id}/image-variants/{id}      -> get_by_id
/// PUT    /{character_id}/image-variants/{id}      -> update
/// DELETE /{character_id}/image-variants/{id}      -> delete
///
/// GET    /{character_id}/scenes                   -> list_by_character
/// POST   /{character_id}/scenes                   -> create
/// GET    /{character_id}/scenes/{id}              -> get_by_id
/// PUT    /{character_id}/scenes/{id}              -> update
/// DELETE /{character_id}/scenes/{id}              -> delete
/// ```
pub fn router() -> Router<AppState> {
    let source_image_routes = Router::new()
        .route(
            "/",
            get(source_image::list_by_character).post(source_image::create),
        )
        .route(
            "/{id}",
            get(source_image::get_by_id)
                .put(source_image::update)
                .delete(source_image::delete),
        );

    let derived_image_routes = Router::new()
        .route(
            "/",
            get(derived_image::list_by_character).post(derived_image::create),
        )
        .route(
            "/{id}",
            get(derived_image::get_by_id)
                .put(derived_image::update)
                .delete(derived_image::delete),
        );

    let image_variant_routes = Router::new()
        .route(
            "/",
            get(image_variant::list_by_character).post(image_variant::create),
        )
        .route(
            "/{id}",
            get(image_variant::get_by_id)
                .put(image_variant::update)
                .delete(image_variant::delete),
        );

    let scene_routes = Router::new()
        .route("/", get(scene::list_by_character).post(scene::create))
        .route(
            "/{id}",
            get(scene::get_by_id)
                .put(scene::update)
                .delete(scene::delete),
        );

    Router::new()
        .nest("/{character_id}/source-images", source_image_routes)
        .nest("/{character_id}/derived-images", derived_image_routes)
        .nest("/{character_id}/image-variants", image_variant_routes)
        .nest("/{character_id}/scenes", scene_routes)
}
