//! Route definitions for poster frame & thumbnail selection (PRD-96).
//!
//! Scene and avatar poster-frame routes are merged into their parent
//! routers. Project-scoped gallery and auto-select routes are merged into
//! the projects router.

use axum::routing::{get, post};
use axum::Router;

use crate::handlers::poster_frame;
use crate::state::AppState;

/// Scene-scoped poster frame routes, merged into `/scenes`.
///
/// ```text
/// GET    /{id}/poster-frame      -> get_scene_poster
/// POST   /{id}/poster-frame      -> set_scene_poster
/// ```
pub fn scene_poster_router() -> Router<AppState> {
    Router::new().route(
        "/{id}/poster-frame",
        get(poster_frame::get_scene_poster).post(poster_frame::set_scene_poster),
    )
}

/// Avatar-scoped poster frame routes, merged into `/avatars`.
///
/// ```text
/// GET    /{id}/poster-frame      -> get_avatar_poster
/// POST   /{id}/poster-frame      -> set_avatar_poster
/// ```
pub fn avatar_poster_router() -> Router<AppState> {
    Router::new().route(
        "/{id}/poster-frame",
        get(poster_frame::get_avatar_poster).post(poster_frame::set_avatar_poster),
    )
}

/// Project-scoped poster gallery and auto-select routes, merged into `/projects`.
///
/// ```text
/// GET    /{id}/poster-gallery            -> get_poster_gallery
/// POST   /{id}/auto-select-posters       -> auto_select_posters
/// ```
pub fn project_poster_router() -> Router<AppState> {
    Router::new()
        .route(
            "/{id}/poster-gallery",
            get(poster_frame::get_poster_gallery),
        )
        .route(
            "/{id}/auto-select-posters",
            post(poster_frame::auto_select_posters),
        )
}
