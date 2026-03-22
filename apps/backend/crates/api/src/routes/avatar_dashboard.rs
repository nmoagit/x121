//! Route definitions for the avatar settings dashboard (PRD-108).
//!
//! Dashboard routes are merged into the `/avatars` router.

use axum::routing::{get, patch};
use axum::Router;

use crate::handlers::avatar_dashboard;
use crate::state::AppState;

/// Avatar-scoped dashboard routes.
///
/// Merged into the existing `/avatars` router.
///
/// ```text
/// GET    /{avatar_id}/dashboard    -> get_dashboard
/// PATCH  /{avatar_id}/settings     -> patch_settings
/// ```
pub fn dashboard_router() -> Router<AppState> {
    Router::new()
        .route(
            "/{avatar_id}/dashboard",
            get(avatar_dashboard::get_dashboard),
        )
        .route(
            "/{avatar_id}/settings",
            patch(avatar_dashboard::patch_settings),
        )
}
