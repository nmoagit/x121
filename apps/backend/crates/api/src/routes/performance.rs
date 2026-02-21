//! Route definitions for performance & benchmarking dashboard (PRD-41).

use axum::routing::{get, post, put};
use axum::Router;

use crate::handlers::performance;
use crate::state::AppState;

/// Performance routes mounted at `/performance`.
///
/// All routes require the `admin` role (enforced by handler extractors).
///
/// ```text
/// GET  /overview                      -> get_overview
/// GET  /trend                         -> get_global_trend
/// GET  /workflow/{id}                 -> get_workflow_performance
/// GET  /workflow/{id}/trend           -> get_workflow_trend
/// GET  /worker/{id}                   -> get_worker_performance
/// GET  /workers/comparison            -> compare_workers
/// GET  /comparison                    -> compare_workflows
/// POST /metrics                       -> record_metric
/// GET  /alerts/thresholds             -> list_alert_thresholds
/// POST /alerts/thresholds             -> create_alert_threshold
/// PUT  /alerts/thresholds/{id}        -> update_alert_threshold
/// DELETE /alerts/thresholds/{id}      -> delete_alert_threshold
/// ```
pub fn router() -> Router<AppState> {
    Router::new()
        // Overview and global trend.
        .route("/overview", get(performance::get_overview))
        .route("/trend", get(performance::get_global_trend))
        // Per-workflow.
        .route("/workflow/{id}", get(performance::get_workflow_performance))
        .route(
            "/workflow/{id}/trend",
            get(performance::get_workflow_trend),
        )
        // Per-worker.
        .route("/worker/{id}", get(performance::get_worker_performance))
        .route(
            "/workers/comparison",
            get(performance::compare_workers),
        )
        // Workflow comparison.
        .route("/comparison", get(performance::compare_workflows))
        // Metric recording.
        .route("/metrics", post(performance::record_metric))
        // Alert threshold CRUD.
        .route(
            "/alerts/thresholds",
            get(performance::list_alert_thresholds).post(performance::create_alert_threshold),
        )
        .route(
            "/alerts/thresholds/{id}",
            put(performance::update_alert_threshold).delete(performance::delete_alert_threshold),
        )
}
