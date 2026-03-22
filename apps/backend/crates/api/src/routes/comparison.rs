//! Route definitions for cross-avatar scene comparison (PRD-68).

use axum::routing::get;
use axum::Router;

use crate::handlers::comparison;
use crate::state::AppState;

/// Routes merged into the `/projects` namespace.
///
/// ```text
/// GET /{project_id}/scene-comparison                       -> scene_comparison
/// GET /{project_id}/avatars/{avatar_id}/all-scenes   -> avatar_all_scenes
/// ```
pub fn router() -> Router<AppState> {
    Router::new()
        .route(
            "/{project_id}/scene-comparison",
            get(comparison::scene_comparison),
        )
        .route(
            "/{project_id}/avatars/{avatar_id}/all-scenes",
            get(comparison::avatar_all_scenes),
        )
}
