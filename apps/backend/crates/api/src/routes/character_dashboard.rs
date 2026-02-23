//! Route definitions for the character settings dashboard (PRD-108).
//!
//! Dashboard routes are merged into the `/characters` router.

use axum::routing::{get, patch};
use axum::Router;

use crate::handlers::character_dashboard;
use crate::state::AppState;

/// Character-scoped dashboard routes.
///
/// Merged into the existing `/characters` router.
///
/// ```text
/// GET    /{character_id}/dashboard    -> get_dashboard
/// PATCH  /{character_id}/settings     -> patch_settings
/// ```
pub fn dashboard_router() -> Router<AppState> {
    Router::new()
        .route(
            "/{character_id}/dashboard",
            get(character_dashboard::get_dashboard),
        )
        .route(
            "/{character_id}/settings",
            patch(character_dashboard::patch_settings),
        )
}
