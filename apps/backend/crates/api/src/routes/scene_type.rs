//! Route definitions for studio-level scene types.
//!
//! Project-scoped scene type routes are mounted via [`super::project::router`].
//! This module only provides the studio-level `/scene-types` router.
//!
//! After PRD-123 unification, this includes track management endpoints
//! (formerly on `/scene-catalogue`).

use axum::routing::{delete, get, post};
use axum::Router;

use crate::handlers::scene_type;
use crate::handlers::scene_type_track_config;
use crate::state::AppState;

/// Routes mounted at `/scene-types` for studio-level scene types.
///
/// ```text
/// GET    /                                         -> list_studio_level
/// POST   /                                         -> create_studio
/// GET    /with-tracks                              -> list_with_tracks (PRD-123)
/// GET    /{id}                                     -> get_by_id
/// PUT    /{id}                                     -> update
/// DELETE /{id}                                     -> delete
/// GET    /{id}/preview-prompt/{character_id}       -> preview_prompt (PRD-23)
/// POST   /{id}/tracks                              -> add_tracks (PRD-123)
/// DELETE /{id}/tracks/{track_id}                   -> remove_track (PRD-123)
/// POST   /matrix                                   -> generate_matrix (PRD-23)
/// POST   /validate                                 -> validate_scene_type_config (PRD-23)
/// GET    /{id}/track-configs                        -> list track configs
/// GET    /{id}/track-configs/{track_id}             -> get track config
/// PUT    /{id}/track-configs/{track_id}             -> upsert track config
/// DELETE /{id}/track-configs/{track_id}             -> delete track config
/// ```
pub fn studio_router() -> Router<AppState> {
    Router::new()
        .route(
            "/",
            get(scene_type::list_studio_level).post(scene_type::create_studio),
        )
        .route("/with-tracks", get(scene_type::list_with_tracks))
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
        .route("/{id}/tracks", post(scene_type::add_tracks))
        .route("/{id}/tracks/{track_id}", delete(scene_type::remove_track))
        .route("/matrix", post(scene_type::generate_matrix))
        .route("/validate", post(scene_type::validate_scene_type_config))
        // Track config overrides
        .route(
            "/{id}/track-configs",
            get(scene_type_track_config::list),
        )
        .route(
            "/{id}/track-configs/{track_id}",
            get(scene_type_track_config::get)
                .put(scene_type_track_config::upsert)
                .delete(scene_type_track_config::delete),
        )
}
