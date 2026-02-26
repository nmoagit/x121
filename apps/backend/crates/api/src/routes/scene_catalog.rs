//! Route definitions for scene catalog entries (PRD-111).

use axum::routing::{delete, get, post};
use axum::Router;

use crate::handlers::scene_catalog;
use crate::state::AppState;

/// Routes mounted at `/scene-catalog`.
///
/// ```text
/// GET    /                         -> list
/// POST   /                         -> create
/// GET    /{id}                     -> get_by_id
/// PUT    /{id}                     -> update
/// DELETE /{id}                     -> deactivate
/// POST   /{id}/tracks              -> add_tracks
/// DELETE /{id}/tracks/{track_id}   -> remove_track
/// ```
pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", get(scene_catalog::list).post(scene_catalog::create))
        .route(
            "/{id}",
            get(scene_catalog::get_by_id)
                .put(scene_catalog::update)
                .delete(scene_catalog::deactivate),
        )
        .route("/{id}/tracks", post(scene_catalog::add_tracks))
        .route(
            "/{id}/tracks/{track_id}",
            delete(scene_catalog::remove_track),
        )
}
