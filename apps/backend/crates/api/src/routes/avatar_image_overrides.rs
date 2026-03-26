//! Route definitions for avatar image overrides (PRD-154).

use axum::routing::{get, put};
use axum::Router;

use crate::handlers::avatar_image_overrides;
use crate::state::AppState;

/// Routes mounted at `/avatars/{avatar_id}/image-settings`.
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
            get(avatar_image_overrides::list_effective).put(avatar_image_overrides::bulk_update),
        )
        .route(
            "/{image_type_id}",
            put(avatar_image_overrides::toggle_single)
                .delete(avatar_image_overrides::remove_override),
        )
        .route(
            "/{image_type_id}/tracks/{track_id}",
            put(avatar_image_overrides::toggle_single_track)
                .delete(avatar_image_overrides::remove_override_track),
        )
}
