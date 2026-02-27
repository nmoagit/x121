//! Route definitions for video spec requirements (PRD-113).
//!
//! Mounted at `/video-specs`.

use axum::routing::get;
use axum::Router;

use crate::handlers::video_spec;
use crate::state::AppState;

/// Video spec routes, intended to be nested under `/video-specs`.
///
/// ```text
/// GET    /       -> list_specs (?project_id, ?scene_type_id)
/// POST   /       -> create_spec
/// GET    /{id}   -> get_spec
/// PUT    /{id}   -> update_spec
/// DELETE /{id}   -> delete_spec
/// ```
pub fn router() -> Router<AppState> {
    Router::new()
        .route(
            "/",
            get(video_spec::list_specs).post(video_spec::create_spec),
        )
        .route(
            "/{id}",
            get(video_spec::get_spec)
                .put(video_spec::update_spec)
                .delete(video_spec::delete_spec),
        )
}
