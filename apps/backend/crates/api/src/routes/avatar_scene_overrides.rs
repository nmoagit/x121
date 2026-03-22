//! Route definitions for avatar scene overrides (PRD-111, PRD-123).

use axum::routing::{get, put};
use axum::Router;

use crate::handlers::avatar_scene_overrides;
use crate::state::AppState;

/// Routes mounted at `/avatars/{avatar_id}/scene-settings`.
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
            get(avatar_scene_overrides::list_effective)
                .put(avatar_scene_overrides::bulk_update),
        )
        .route(
            "/{scene_type_id}",
            put(avatar_scene_overrides::toggle_single)
                .delete(avatar_scene_overrides::remove_override),
        )
        .route(
            "/{scene_type_id}/tracks/{track_id}",
            put(avatar_scene_overrides::toggle_single_track)
                .delete(avatar_scene_overrides::remove_override_track),
        )
}
