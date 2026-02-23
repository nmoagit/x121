//! Route definitions for cost & resource estimation (PRD-61).

use axum::routing::{get, post};
use axum::Router;

use crate::handlers::estimation;
use crate::state::AppState;

/// Estimation routes mounted at `/estimates`.
///
/// ```text
/// POST /                  -> estimate_scenes
/// GET  /history           -> list_calibration_data
/// POST /record            -> record_metric
/// ```
pub fn estimation_router() -> Router<AppState> {
    Router::new()
        .route("/", post(estimation::estimate_scenes))
        .route("/history", get(estimation::list_calibration_data))
        .route("/record", post(estimation::record_metric))
}
