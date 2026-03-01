//! Route definitions for group scene settings.

use axum::routing::{get, put};
use axum::Router;

use crate::handlers::group_scene_settings;
use crate::state::AppState;

/// Routes mounted at `/projects/{project_id}/groups/{group_id}/scene-settings`.
///
/// ```text
/// GET    /                                       -> list_effective
/// PUT    /                                       -> bulk_update
/// PUT    /{scene_type_id}                        -> toggle_single
/// DELETE /{scene_type_id}                        -> remove_override
/// PUT    /{scene_type_id}/tracks/{track_id}      -> toggle_single_track
/// DELETE /{scene_type_id}/tracks/{track_id}      -> remove_override_track
/// ```
pub fn router() -> Router<AppState> {
    Router::new()
        .route(
            "/",
            get(group_scene_settings::list_effective).put(group_scene_settings::bulk_update),
        )
        .route(
            "/{scene_type_id}",
            put(group_scene_settings::toggle_single)
                .delete(group_scene_settings::remove_override),
        )
        .route(
            "/{scene_type_id}/tracks/{track_id}",
            put(group_scene_settings::toggle_single_track)
                .delete(group_scene_settings::remove_override_track),
        )
}
