//! Route definitions for project scene settings (PRD-111, PRD-123).

use axum::routing::{get, put};
use axum::Router;

use crate::handlers::project_scene_settings;
use crate::state::AppState;

/// Routes mounted at `/projects/{project_id}/scene-settings`.
///
/// ```text
/// GET  /                                       -> list_effective
/// PUT  /                                       -> bulk_update
/// PUT  /{scene_type_id}                        -> toggle_single
/// PUT  /{scene_type_id}/tracks/{track_id}      -> toggle_single_track
/// ```
pub fn router() -> Router<AppState> {
    Router::new()
        .route(
            "/",
            get(project_scene_settings::list_effective).put(project_scene_settings::bulk_update),
        )
        .route(
            "/{scene_type_id}",
            put(project_scene_settings::toggle_single),
        )
        .route(
            "/{scene_type_id}/tracks/{track_id}",
            put(project_scene_settings::toggle_single_track),
        )
}
