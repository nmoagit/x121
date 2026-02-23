//! Route definitions for incremental re-stitching & smoothing (PRD-25).
//!
//! These routers are merged into the `/segments` nest in `api_routes()`:
//!
//! ```text
//! /segments/{id}/regenerate         — regenerate a single segment (POST)
//! /segments/{id}/boundary-check     — check boundary SSIM (GET)
//! /segments/{id}/smooth-boundary    — apply boundary smoothing (POST)
//! /segments/{id}/versions           — version history (GET)
//! /segments/{id}/clear-stale        — clear stale flag (PATCH)
//! ```

use axum::routing::{get, patch, post};
use axum::Router;

use crate::handlers::restitching;
use crate::state::AppState;

/// Segment-scoped re-stitching routes, merged into the `/segments` nest.
pub fn segment_restitching_router() -> Router<AppState> {
    Router::new()
        .route(
            "/{id}/regenerate",
            post(restitching::regenerate),
        )
        .route(
            "/{id}/boundary-check",
            get(restitching::boundary_check),
        )
        .route(
            "/{id}/smooth-boundary",
            post(restitching::smooth_boundary),
        )
        .route(
            "/{id}/versions",
            get(restitching::list_versions),
        )
        .route(
            "/{id}/clear-stale",
            patch(restitching::clear_stale),
        )
}
