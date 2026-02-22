//! Route definitions for automated quality gate endpoints (PRD-49).
//!
//! These routers are merged into existing nests in `api_routes()`:
//!
//! ```text
//! /segments/{segment_id}/qa-scores                    per-segment QA scores (GET)
//! /scenes/{scene_id}/qa-summary                       scene QA summary (GET)
//! /projects/{project_id}/qa-thresholds                list, upsert (GET, POST)
//! /projects/{project_id}/qa-thresholds/{id}           delete (DELETE)
//! /qa/quality-gates/defaults                          studio defaults (GET)
//! ```

use axum::routing::{delete, get};
use axum::Router;

use crate::handlers::quality_gates;
use crate::state::AppState;

/// Segment-scoped QA score routes, merged into the `/segments` nest.
pub fn segment_qa_router() -> Router<AppState> {
    Router::new()
        .route(
            "/{segment_id}/qa-scores",
            get(quality_gates::get_segment_scores),
        )
}

/// Scene-scoped QA summary routes, merged into the `/scenes` nest.
pub fn scene_qa_router() -> Router<AppState> {
    Router::new()
        .route(
            "/{scene_id}/qa-summary",
            get(quality_gates::get_scene_qa_summary),
        )
}

/// Project-scoped threshold management routes, merged into the `/projects` nest.
pub fn threshold_router() -> Router<AppState> {
    Router::new()
        .route(
            "/{project_id}/qa-thresholds",
            get(quality_gates::list_thresholds).post(quality_gates::upsert_threshold),
        )
        .route(
            "/{project_id}/qa-thresholds/{id}",
            delete(quality_gates::delete_threshold),
        )
}

/// Studio-level QA default routes, nested at `/qa/quality-gates`.
pub fn studio_qa_router() -> Router<AppState> {
    Router::new().route("/defaults", get(quality_gates::list_studio_defaults))
}
