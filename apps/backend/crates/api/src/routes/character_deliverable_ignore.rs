//! Route definitions for character deliverable ignores (PRD-126).

use axum::routing::get;
use axum::Router;

use crate::handlers::character_deliverable_ignore;
use crate::state::AppState;

/// Routes mounted at `/characters/{character_id}/deliverable-ignores`.
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
            get(character_deliverable_ignore::list_ignores)
                .post(character_deliverable_ignore::add_ignore),
        )
        .route(
            "/{uuid}",
            axum::routing::delete(character_deliverable_ignore::remove_ignore),
        )
}
