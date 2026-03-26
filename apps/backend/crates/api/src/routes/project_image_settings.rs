//! Route definitions for project image settings (PRD-154).

use axum::routing::{get, put};
use axum::Router;

use crate::handlers::project_image_settings;
use crate::state::AppState;

/// Routes mounted at `/projects/{project_id}/image-settings`.
///
/// ```text
/// GET  /                                       -> list_effective
/// PUT  /                                       -> bulk_update
/// PUT  /{image_type_id}                        -> toggle_single
/// PUT  /{image_type_id}/tracks/{track_id}      -> toggle_single_track
/// ```
pub fn router() -> Router<AppState> {
    Router::new()
        .route(
            "/",
            get(project_image_settings::list_effective).put(project_image_settings::bulk_update),
        )
        .route(
            "/{image_type_id}",
            put(project_image_settings::toggle_single),
        )
        .route(
            "/{image_type_id}/tracks/{track_id}",
            put(project_image_settings::toggle_single_track),
        )
}
