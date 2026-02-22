//! Route definitions for the recursive video generation loop (PRD-24).
//!
//! These routes are merged into the existing `/scenes` and `/segments`
//! nesting points rather than creating a top-level prefix.
//!
//! ```text
//! POST   /{id}/generate                  start_generation
//! GET    /{id}/progress                  get_progress
//! POST   /batch-generate                 batch_generate
//!
//! POST   /{id}/select-boundary-frame     select_boundary_frame
//! ```

use axum::routing::{get, post};
use axum::Router;

use crate::handlers::generation;
use crate::state::AppState;

/// Routes merged into the `/scenes` nest.
///
/// ```text
/// POST /{id}/generate
/// GET  /{id}/progress
/// POST /batch-generate
/// ```
pub fn generation_scene_router() -> Router<AppState> {
    Router::new()
        .route("/{id}/generate", post(generation::start_generation))
        .route("/{id}/progress", get(generation::get_progress))
        .route("/batch-generate", post(generation::batch_generate))
}

/// Routes merged into the `/segments` nest.
///
/// ```text
/// POST /{id}/select-boundary-frame
/// ```
pub fn generation_segment_router() -> Router<AppState> {
    Router::new().route(
        "/{id}/select-boundary-frame",
        post(generation::select_boundary_frame),
    )
}
