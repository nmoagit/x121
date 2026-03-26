//! Route definitions for avatar images (PRD-154).
//!
//! These routes are merged into the `/avatars` nest.

use axum::routing::{get, post};
use axum::Router;

use crate::handlers::avatar_image;
use crate::state::AppState;

/// Routes merged into the avatars router.
///
/// ```text
/// GET    /{avatar_id}/images                       -> list_by_avatar
/// POST   /{avatar_id}/images                       -> create
/// PUT    /{avatar_id}/images/{id}                  -> update
/// DELETE /{avatar_id}/images/{id}                  -> delete (soft)
/// POST   /{avatar_id}/images/{id}/approve          -> approve
/// POST   /{avatar_id}/images/{id}/reject           -> reject
/// ```
pub fn avatar_image_router() -> Router<AppState> {
    Router::new()
        .route(
            "/{avatar_id}/images",
            get(avatar_image::list_by_avatar).post(avatar_image::create),
        )
        .route(
            "/{avatar_id}/images/{id}",
            axum::routing::put(avatar_image::update).delete(avatar_image::delete),
        )
        .route(
            "/{avatar_id}/images/{id}/approve",
            post(avatar_image::approve),
        )
        .route(
            "/{avatar_id}/images/{id}/reject",
            post(avatar_image::reject),
        )
}
