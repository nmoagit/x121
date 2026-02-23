//! Route definitions for failure pattern analytics endpoints (PRD-64).
//!
//! These routers are nested in `api_routes()`:
//!
//! ```text
//! /analytics/failure-patterns              list patterns (GET)
//! /analytics/failure-patterns/{id}         get pattern (GET)
//! /analytics/failure-heatmap               heatmap data (GET)
//! /analytics/failure-trends                trend data (GET)
//! /analytics/failure-alerts                alert check (GET)
//!
//! /failure-patterns/{id}/fixes             create fix (POST), list fixes (GET)
//! /failure-patterns/fixes/{id}/effectiveness  update effectiveness (PATCH)
//! ```

use axum::routing::{get, patch, post};
use axum::Router;

use crate::handlers::failure_analytics;
use crate::state::AppState;

/// Analytics routes nested at `/analytics`.
pub fn analytics_router() -> Router<AppState> {
    Router::new()
        .route(
            "/failure-patterns",
            get(failure_analytics::list_patterns),
        )
        .route(
            "/failure-patterns/{id}",
            get(failure_analytics::get_pattern),
        )
        .route(
            "/failure-heatmap",
            get(failure_analytics::get_heatmap),
        )
        .route(
            "/failure-trends",
            get(failure_analytics::get_trends),
        )
        .route(
            "/failure-alerts",
            get(failure_analytics::check_alerts),
        )
}

/// Pattern fix routes nested at `/failure-patterns`.
pub fn pattern_fixes_router() -> Router<AppState> {
    Router::new()
        .route(
            "/{id}/fixes",
            post(failure_analytics::create_fix).get(failure_analytics::list_fixes),
        )
        .route(
            "/fixes/{id}/effectiveness",
            patch(failure_analytics::update_fix_effectiveness),
        )
}
