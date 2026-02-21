//! Route definitions for character-scoped sub-resources.
//!
//! These routes are mounted at `/characters` and provide access to
//! source images, derived images, image variants, and scenes that
//! belong to a specific character.

use axum::routing::{get, post};
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
/// POST   /{character_id}/image-variants/{id}/approve  -> approve_as_hero
/// POST   /{character_id}/image-variants/{id}/reject   -> reject_variant
/// POST   /{character_id}/image-variants/{id}/export   -> export_for_editing
/// POST   /{character_id}/image-variants/{id}/reimport -> reimport_variant
/// GET    /{character_id}/image-variants/{id}/history  -> variant_history
/// POST   /{character_id}/image-variants/upload        -> upload_manual_variant
/// POST   /{character_id}/image-variants/generate      -> generate_variants
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
        .route("/upload", post(image_variant::upload_manual_variant))
        .route("/generate", post(image_variant::generate_variants))
        .route(
            "/{id}",
            get(image_variant::get_by_id)
                .put(image_variant::update)
                .delete(image_variant::delete),
        )
        .route("/{id}/approve", post(image_variant::approve_as_hero))
        .route("/{id}/reject", post(image_variant::reject_variant))
        .route("/{id}/export", post(image_variant::export_for_editing))
        .route("/{id}/reimport", post(image_variant::reimport_variant))
        .route("/{id}/history", get(image_variant::variant_history));

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
