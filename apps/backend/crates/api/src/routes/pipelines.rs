//! Route definitions for pipelines (PRD-138).

use axum::routing::get;
use axum::Router;

use crate::handlers::pipelines;
use crate::state::AppState;

/// Routes mounted at `/pipelines`.
///
/// ```text
/// GET    /       -> list
/// POST   /       -> create
/// GET    /{id}   -> get_by_id
/// PUT    /{id}   -> update
/// DELETE /{id}   -> delete
/// ```
pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", get(pipelines::list).post(pipelines::create))
        .route(
            "/{id}",
            get(pipelines::get_by_id)
                .put(pipelines::update)
                .delete(pipelines::delete),
        )
}
