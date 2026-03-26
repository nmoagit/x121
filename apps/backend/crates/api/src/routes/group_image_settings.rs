//! Route definitions for group image settings (PRD-154).

use axum::routing::{get, put};
use axum::Router;

use crate::handlers::group_image_settings;
use crate::state::AppState;

/// Routes mounted at `/projects/{project_id}/groups/{group_id}/image-settings`.
///
/// ```text
/// GET    /                                       -> list_effective
/// PUT    /                                       -> bulk_update
/// PUT    /{image_type_id}                        -> toggle_single
/// DELETE /{image_type_id}                        -> remove_override
/// PUT    /{image_type_id}/tracks/{track_id}      -> toggle_single_track
/// DELETE /{image_type_id}/tracks/{track_id}      -> remove_override_track
/// ```
pub fn router() -> Router<AppState> {
    Router::new()
        .route(
            "/",
            get(group_image_settings::list_effective).put(group_image_settings::bulk_update),
        )
        .route(
            "/{image_type_id}",
            put(group_image_settings::toggle_single).delete(group_image_settings::remove_override),
        )
        .route(
            "/{image_type_id}/tracks/{track_id}",
            put(group_image_settings::toggle_single_track)
                .delete(group_image_settings::remove_override_track),
        )
}
