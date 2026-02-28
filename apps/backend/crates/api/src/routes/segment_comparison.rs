//! Route definitions for segment regeneration comparison (PRD-101).
//!
//! These routers are merged into the `/segments` nest in `api_routes()`:
//!
//! ```text
//! /segments/{id}/version-history                   — list all versions (GET)
//! /segments/{id}/compare?v1={n}&v2={n}             — compare two versions (GET)
//! /segments/{id}/versions/{version_id}/select      — select active version (POST)
//! /segments/{id}/versions/{version_id}             — get single version (GET)
//! ```

use axum::routing::{get, post};
use axum::Router;

use crate::handlers::segment_comparison;
use crate::state::AppState;

/// Segment-scoped comparison routes, merged into the `/segments` nest.
pub fn segment_comparison_router() -> Router<AppState> {
    Router::new()
        .route(
            "/{id}/version-history",
            get(segment_comparison::list_version_history),
        )
        .route("/{id}/compare", get(segment_comparison::compare_versions))
        .route(
            "/{id}/versions/{version_id}/select",
            post(segment_comparison::select_version),
        )
        .route(
            "/{id}/versions/{version_id}",
            get(segment_comparison::get_version),
        )
}
