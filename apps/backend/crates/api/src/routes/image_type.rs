//! Route definitions for image types (PRD-154).

use axum::routing::{get, put};
use axum::Router;

use crate::handlers::image_type;
use crate::handlers::image_type_track_config;
use crate::state::AppState;

/// Routes mounted at `/image-types`.
///
/// ```text
/// GET    /                                         -> list (with pipeline_id query param)
/// POST   /                                         -> create
/// GET    /{id}                                     -> get_by_id (with tracks)
/// PUT    /{id}                                     -> update (with track_ids)
/// DELETE /{id}                                     -> delete (soft)
/// GET    /{id}/track-configs                       -> list track configs
/// PUT    /{id}/track-configs/{track_id}            -> upsert track config
/// DELETE /{id}/track-configs/{track_id}            -> delete track config
/// ```
pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", get(image_type::list).post(image_type::create))
        .route(
            "/{id}",
            get(image_type::get_by_id)
                .put(image_type::update)
                .delete(image_type::delete),
        )
        // Track config overrides
        .route(
            "/{id}/track-configs",
            get(image_type_track_config::list),
        )
        .route(
            "/{id}/track-configs/{track_id}",
            put(image_type_track_config::upsert)
                .delete(image_type_track_config::delete),
        )
}
