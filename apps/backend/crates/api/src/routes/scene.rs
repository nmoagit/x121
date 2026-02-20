//! Route definitions for scene-scoped sub-resources.
//!
//! These routes are mounted at `/scenes` and provide access to segments
//! that belong to a specific scene.

use axum::routing::get;
use axum::Router;

use crate::handlers::segment;
use crate::state::AppState;

/// Routes mounted at `/scenes`.
///
/// ```text
/// GET    /{scene_id}/segments           -> list_by_scene
/// POST   /{scene_id}/segments           -> create
/// GET    /{scene_id}/segments/{id}      -> get_by_id
/// PUT    /{scene_id}/segments/{id}      -> update
/// DELETE /{scene_id}/segments/{id}      -> delete
/// ```
pub fn router() -> Router<AppState> {
    let segment_routes = Router::new()
        .route("/", get(segment::list_by_scene).post(segment::create))
        .route(
            "/{id}",
            get(segment::get_by_id)
                .put(segment::update)
                .delete(segment::delete),
        );

    Router::new().nest("/{scene_id}/segments", segment_routes)
}
