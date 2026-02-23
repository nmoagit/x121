//! Route definitions for temporal continuity endpoints (PRD-26).

use axum::routing::{get, post};
use axum::Router;

use crate::handlers::temporal;
use crate::state::AppState;

/// Scene-scoped temporal routes merged into `/scenes`.
///
/// ```text
/// GET /{scene_id}/temporal-metrics   -> get_scene_metrics
/// ```
pub fn scene_temporal_router() -> Router<AppState> {
    Router::new().route(
        "/{scene_id}/temporal-metrics",
        get(temporal::get_scene_metrics),
    )
}

/// Segment-scoped temporal routes merged into `/segments`.
///
/// ```text
/// GET  /{id}/temporal-metric    -> get_segment_metric
/// POST /{id}/analyze-drift      -> analyze_drift
/// POST /{id}/analyze-grain      -> analyze_grain
/// POST /{id}/normalize-grain    -> normalize_grain
/// ```
pub fn segment_temporal_router() -> Router<AppState> {
    Router::new()
        .route("/{id}/temporal-metric", get(temporal::get_segment_metric))
        .route("/{id}/analyze-drift", post(temporal::analyze_drift))
        .route("/{id}/analyze-grain", post(temporal::analyze_grain))
        .route("/{id}/normalize-grain", post(temporal::normalize_grain))
}

/// Project-scoped temporal settings routes merged into `/projects`.
///
/// ```text
/// GET /{project_id}/temporal-settings   -> get_settings
/// PUT /{project_id}/temporal-settings   -> update_settings
/// ```
pub fn project_temporal_router() -> Router<AppState> {
    Router::new().route(
        "/{project_id}/temporal-settings",
        get(temporal::get_settings).put(temporal::update_settings),
    )
}
