//! Route definitions for avatar deliverable ignores (PRD-126).

use axum::routing::get;
use axum::Router;

use crate::handlers::avatar_deliverable_ignore;
use crate::state::AppState;

/// Routes mounted at `/avatars/{avatar_id}/deliverable-ignores`.
///
/// ```text
/// GET    /                -> list_ignores
/// POST   /                -> add_ignore
/// DELETE /{uuid}          -> remove_ignore
/// ```
pub fn router() -> Router<AppState> {
    Router::new()
        .route(
            "/",
            get(avatar_deliverable_ignore::list_ignores)
                .post(avatar_deliverable_ignore::add_ignore),
        )
        .route(
            "/{uuid}",
            axum::routing::delete(avatar_deliverable_ignore::remove_ignore),
        )
}
