//! Route definitions for hardware monitoring endpoints (PRD-06).

use axum::routing::{get, put};
use axum::Router;

use crate::handlers::hardware;
use crate::state::AppState;

/// Admin routes mounted at `/admin/hardware`.
///
/// All routes require the `admin` role (enforced by handler extractors).
///
/// ```text
/// GET  /workers/metrics/current       -> get_all_workers_current
/// GET  /workers/{id}/metrics          -> get_worker_metrics
/// POST /workers/{id}/restart          -> restart_service
/// GET  /workers/{id}/restarts         -> list_restart_logs
/// GET  /thresholds                    -> list_thresholds
/// PUT  /workers/{id}/thresholds       -> update_worker_thresholds
/// PUT  /thresholds/global             -> update_global_thresholds
/// ```
pub fn router() -> Router<AppState> {
    Router::new()
        .route(
            "/workers/metrics/current",
            get(hardware::get_all_workers_current),
        )
        .route("/workers/{id}/metrics", get(hardware::get_worker_metrics))
        .route(
            "/workers/{id}/restart",
            axum::routing::post(hardware::restart_service),
        )
        .route("/workers/{id}/restarts", get(hardware::list_restart_logs))
        .route("/thresholds", get(hardware::list_thresholds))
        .route(
            "/workers/{id}/thresholds",
            put(hardware::update_worker_thresholds),
        )
        .route(
            "/thresholds/global",
            put(hardware::update_global_thresholds),
        )
}
