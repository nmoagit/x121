//! Route definitions for the `/admin/storage` resource (PRD-19).

use axum::routing::{get, post};
use axum::Router;

use crate::handlers::storage_visualizer;
use crate::state::AppState;

/// Routes mounted at `/admin/storage`.
///
/// All routes require the `admin` role (enforced by handler extractors).
///
/// ```text
/// GET    /treemap              -> hierarchical treemap data
/// GET    /breakdown            -> file type distribution
/// GET    /summary              -> total storage, file count, reclaimable
/// POST   /refresh              -> trigger snapshot refresh
/// GET    /categories           -> list file type categories
/// ```
pub fn router() -> Router<AppState> {
    Router::new()
        .route("/treemap", get(storage_visualizer::treemap))
        .route("/breakdown", get(storage_visualizer::breakdown))
        .route("/summary", get(storage_visualizer::summary))
        .route("/refresh", post(storage_visualizer::refresh))
        .route("/categories", get(storage_visualizer::list_categories))
}
