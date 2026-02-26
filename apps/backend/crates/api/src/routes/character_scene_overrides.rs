//! Route definitions for character scene overrides (PRD-111).

use axum::routing::{get, put};
use axum::Router;

use crate::handlers::character_scene_overrides;
use crate::state::AppState;

/// Routes mounted at `/characters/{character_id}/scene-settings`.
///
/// ```text
/// GET    /                         -> list_effective
/// PUT    /                         -> bulk_update
/// PUT    /{scene_catalog_id}       -> toggle_single
/// DELETE /{scene_catalog_id}       -> remove_override
/// ```
pub fn router() -> Router<AppState> {
    Router::new()
        .route(
            "/",
            get(character_scene_overrides::list_effective)
                .put(character_scene_overrides::bulk_update),
        )
        .route(
            "/{scene_catalog_id}",
            put(character_scene_overrides::toggle_single)
                .delete(character_scene_overrides::remove_override),
        )
}
