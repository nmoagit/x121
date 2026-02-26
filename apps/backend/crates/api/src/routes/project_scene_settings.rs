//! Route definitions for project scene settings (PRD-111).

use axum::routing::{get, put};
use axum::Router;

use crate::handlers::project_scene_settings;
use crate::state::AppState;

/// Routes mounted at `/projects/{project_id}/scene-settings`.
///
/// ```text
/// GET /                            -> list_effective
/// PUT /                            -> bulk_update
/// PUT /{scene_catalog_id}          -> toggle_single
/// ```
pub fn router() -> Router<AppState> {
    Router::new()
        .route(
            "/",
            get(project_scene_settings::list_effective).put(project_scene_settings::bulk_update),
        )
        .route(
            "/{scene_catalog_id}",
            put(project_scene_settings::toggle_single),
        )
}
