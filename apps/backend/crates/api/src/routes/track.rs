//! Route definitions for tracks (PRD-111).

use axum::routing::get;
use axum::Router;

use crate::handlers::track;
use crate::state::AppState;

/// Routes mounted at `/tracks`.
///
/// ```text
/// GET  /       -> list
/// POST /       -> create
/// PUT  /{id}   -> update
/// ```
pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", get(track::list).post(track::create))
        .route("/{id}", axum::routing::put(track::update))
}
