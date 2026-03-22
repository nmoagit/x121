//! Route definitions for avatar-scoped sub-resources.
//!
//! These routes are mounted at `/avatars` and provide access to
//! source images, derived images, image variants, and scenes that
//! belong to a specific avatar.

use axum::extract::DefaultBodyLimit;
use axum::routing::{get, post, put};
use axum::Router;

use crate::handlers::{annotation, derived_image, image_variant, scene, source_image};
use crate::state::AppState;

/// Routes mounted at `/avatars`.
///
/// ```text
/// GET    /{avatar_id}/source-images           -> list_by_avatar
/// POST   /{avatar_id}/source-images           -> create
/// GET    /{avatar_id}/source-images/{id}      -> get_by_id
/// PUT    /{avatar_id}/source-images/{id}      -> update
/// DELETE /{avatar_id}/source-images/{id}      -> delete
///
/// GET    /{avatar_id}/derived-images           -> list_by_avatar
/// POST   /{avatar_id}/derived-images           -> create
/// GET    /{avatar_id}/derived-images/{id}      -> get_by_id
/// PUT    /{avatar_id}/derived-images/{id}      -> update
/// DELETE /{avatar_id}/derived-images/{id}      -> delete
///
/// GET    /{avatar_id}/image-variants           -> list_by_avatar
/// POST   /{avatar_id}/image-variants           -> create
/// GET    /{avatar_id}/image-variants/{id}      -> get_by_id
/// PUT    /{avatar_id}/image-variants/{id}      -> update
/// DELETE /{avatar_id}/image-variants/{id}      -> delete
/// POST   /{avatar_id}/image-variants/{id}/approve  -> approve_as_hero
/// POST   /{avatar_id}/image-variants/{id}/reject   -> reject_variant
/// POST   /{avatar_id}/image-variants/{id}/export   -> export_for_editing
/// POST   /{avatar_id}/image-variants/{id}/reimport -> reimport_variant
/// GET    /{avatar_id}/image-variants/{id}/history  -> variant_history
/// GET    /{avatar_id}/image-variants/{id}/annotations        -> list_image_variant_annotations
/// PUT    /{avatar_id}/image-variants/{id}/annotations/{frame} -> upsert_image_variant_annotation
/// DELETE /{avatar_id}/image-variants/{id}/annotations/{frame} -> delete_image_variant_frame_annotations
/// POST   /{avatar_id}/image-variants/upload        -> upload_manual_variant
/// POST   /{avatar_id}/image-variants/generate      -> generate_variants
///
/// GET    /{avatar_id}/scenes                   -> list_by_avatar
/// POST   /{avatar_id}/scenes                   -> create
/// GET    /{avatar_id}/scenes/{id}              -> get_by_id
/// PUT    /{avatar_id}/scenes/{id}              -> update
/// DELETE /{avatar_id}/scenes/{id}              -> delete
/// ```
pub fn router() -> Router<AppState> {
    let source_image_routes = Router::new()
        .route(
            "/",
            get(source_image::list_by_avatar).post(source_image::create),
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
            get(derived_image::list_by_avatar).post(derived_image::create),
        )
        .route(
            "/{id}",
            get(derived_image::get_by_id)
                .put(derived_image::update)
                .delete(derived_image::delete),
        );

    /// 50 MB — generous limit for image uploads and reimports.
    const IMAGE_BODY_LIMIT: usize = 50 * 1024 * 1024;

    let image_variant_routes = Router::new()
        .route(
            "/",
            get(image_variant::list_by_avatar).post(image_variant::create),
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
        .route("/{id}/unapprove", post(image_variant::unapprove_variant))
        .route("/{id}/reject", post(image_variant::reject_variant))
        .route("/{id}/export", post(image_variant::export_for_editing))
        .route("/{id}/reimport", post(image_variant::reimport_variant))
        .route("/{id}/history", get(image_variant::variant_history))
        .route("/{id}/thumbnail", get(image_variant::thumbnail))
        .route(
            "/{id}/annotations",
            get(annotation::list_image_variant_annotations),
        )
        .route(
            "/{id}/annotations/{frame}",
            put(annotation::upsert_image_variant_annotation)
                .delete(annotation::delete_image_variant_frame_annotations),
        )
        .layer(DefaultBodyLimit::max(IMAGE_BODY_LIMIT));

    let scene_routes = Router::new()
        .route("/", get(scene::list_by_avatar).post(scene::create))
        .route(
            "/{id}",
            get(scene::get_by_id)
                .put(scene::update)
                .delete(scene::delete),
        );

    Router::new()
        .nest("/{avatar_id}/source-images", source_image_routes)
        .nest("/{avatar_id}/derived-images", derived_image_routes)
        .nest("/{avatar_id}/image-variants", image_variant_routes)
        .nest("/{avatar_id}/scenes", scene_routes)
}
