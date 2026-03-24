//! Route definitions for avatar-scoped sub-resources.
//!
//! These routes are mounted at `/avatars` and provide access to
//! source images, derived images, image variants, and scenes that
//! belong to a specific avatar.

use axum::extract::DefaultBodyLimit;
use axum::routing::{get, post, put};
use axum::Router;

use crate::handlers::{annotation, derived_media, media_variant, scene, source_media};
use crate::state::AppState;

/// Routes mounted at `/avatars`.
///
/// ```text
/// GET    /{avatar_id}/source-media           -> list_by_avatar
/// POST   /{avatar_id}/source-media           -> create
/// GET    /{avatar_id}/source-media/{id}      -> get_by_id
/// PUT    /{avatar_id}/source-media/{id}      -> update
/// DELETE /{avatar_id}/source-media/{id}      -> delete
///
/// GET    /{avatar_id}/derived-media           -> list_by_avatar
/// POST   /{avatar_id}/derived-media           -> create
/// GET    /{avatar_id}/derived-media/{id}      -> get_by_id
/// PUT    /{avatar_id}/derived-media/{id}      -> update
/// DELETE /{avatar_id}/derived-media/{id}      -> delete
///
/// GET    /{avatar_id}/media-variants           -> list_by_avatar
/// POST   /{avatar_id}/media-variants           -> create
/// GET    /{avatar_id}/media-variants/{id}      -> get_by_id
/// PUT    /{avatar_id}/media-variants/{id}      -> update
/// DELETE /{avatar_id}/media-variants/{id}      -> delete
/// POST   /{avatar_id}/media-variants/{id}/approve  -> approve_as_hero
/// POST   /{avatar_id}/media-variants/{id}/reject   -> reject_variant
/// POST   /{avatar_id}/media-variants/{id}/export   -> export_for_editing
/// POST   /{avatar_id}/media-variants/{id}/reimport -> reimport_variant
/// GET    /{avatar_id}/media-variants/{id}/history  -> variant_history
/// GET    /{avatar_id}/media-variants/{id}/annotations        -> list_media_variant_annotations
/// PUT    /{avatar_id}/media-variants/{id}/annotations/{frame} -> upsert_media_variant_annotation
/// DELETE /{avatar_id}/media-variants/{id}/annotations/{frame} -> delete_media_variant_frame_annotations
/// POST   /{avatar_id}/media-variants/upload        -> upload_manual_variant
/// POST   /{avatar_id}/media-variants/generate      -> generate_variants
///
/// GET    /{avatar_id}/scenes                   -> list_by_avatar
/// POST   /{avatar_id}/scenes                   -> create
/// GET    /{avatar_id}/scenes/{id}              -> get_by_id
/// PUT    /{avatar_id}/scenes/{id}              -> update
/// DELETE /{avatar_id}/scenes/{id}              -> delete
/// ```
pub fn router() -> Router<AppState> {
    let source_media_routes = Router::new()
        .route(
            "/",
            get(source_media::list_by_avatar).post(source_media::create),
        )
        .route(
            "/{id}",
            get(source_media::get_by_id)
                .put(source_media::update)
                .delete(source_media::delete),
        );

    let derived_media_routes = Router::new()
        .route(
            "/",
            get(derived_media::list_by_avatar).post(derived_media::create),
        )
        .route(
            "/{id}",
            get(derived_media::get_by_id)
                .put(derived_media::update)
                .delete(derived_media::delete),
        );

    /// 50 MB — generous limit for image uploads and reimports.
    const IMAGE_BODY_LIMIT: usize = 50 * 1024 * 1024;

    let media_variant_routes = Router::new()
        .route(
            "/",
            get(media_variant::list_by_avatar).post(media_variant::create),
        )
        .route("/upload", post(media_variant::upload_manual_variant))
        .route("/generate", post(media_variant::generate_variants))
        .route(
            "/{id}",
            get(media_variant::get_by_id)
                .put(media_variant::update)
                .delete(media_variant::delete),
        )
        .route("/{id}/approve", post(media_variant::approve_as_hero))
        .route("/{id}/unapprove", post(media_variant::unapprove_variant))
        .route("/{id}/reject", post(media_variant::reject_variant))
        .route("/{id}/export", post(media_variant::export_for_editing))
        .route("/{id}/reimport", post(media_variant::reimport_variant))
        .route("/{id}/history", get(media_variant::variant_history))
        .route("/{id}/thumbnail", get(media_variant::thumbnail))
        .route(
            "/{id}/annotations",
            get(annotation::list_media_variant_annotations),
        )
        .route(
            "/{id}/annotations/{frame}",
            put(annotation::upsert_media_variant_annotation)
                .delete(annotation::delete_media_variant_frame_annotations),
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
        .nest("/{avatar_id}/source-media", source_media_routes)
        .nest("/{avatar_id}/derived-media", derived_media_routes)
        .nest("/{avatar_id}/media-variants", media_variant_routes)
        .nest("/{avatar_id}/scenes", scene_routes)
}
