//! Route definitions for the Multi-Resolution Pipeline feature (PRD-59).
//!
//! Provides two routers:
//! - `resolution_router` for `/resolution-tiers` CRUD
//! - `scene_resolution_router` for scene-scoped resolution endpoints

use axum::routing::{get, post};
use axum::Router;

use crate::handlers::resolution;
use crate::state::AppState;

/// Resolution tier routes, registered as `/resolution-tiers`.
///
/// ```text
/// GET    /            list_tiers
/// POST   /            create_tier
/// GET    /{id}        get_tier
/// ```
pub fn resolution_router() -> Router<AppState> {
    Router::new()
        .route("/", get(resolution::list_tiers).post(resolution::create_tier))
        .route("/{id}", get(resolution::get_tier))
}

/// Scene-scoped resolution routes, merged under `/scenes/{id}`.
///
/// ```text
/// POST   /upscale     upscale_scene
/// GET    /tier        get_scene_tier
/// ```
pub fn scene_resolution_router() -> Router<AppState> {
    Router::new()
        .route("/upscale", post(resolution::upscale_scene))
        .route("/tier", get(resolution::get_scene_tier))
}
