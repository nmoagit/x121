//! Route definitions for the API Observability Dashboard (PRD-106).
//!
//! Mounted at `/admin/api-metrics` and `/admin/api-alerts` by `api_routes()`.

use axum::routing::{get, put};
use axum::Router;

use crate::handlers::api_observability;
use crate::state::AppState;

/// API metrics admin routes.
///
/// ```text
/// GET  /                         -> query_metrics
/// GET  /summary                  -> get_summary
/// GET  /endpoints                -> get_endpoint_breakdown
/// GET  /keys                     -> get_key_breakdown
/// GET  /heatmap                  -> get_heatmap
/// GET  /top-consumers            -> get_top_consumers
/// GET  /rate-limits              -> list_rate_limits
/// GET  /rate-limits/{key_id}/history -> get_rate_limit_history
/// GET  /sample-payloads          -> list_sample_payloads
/// ```
pub fn metrics_router() -> Router<AppState> {
    Router::new()
        .route("/", get(api_observability::query_metrics))
        .route("/summary", get(api_observability::get_summary))
        .route("/endpoints", get(api_observability::get_endpoint_breakdown))
        .route("/keys", get(api_observability::get_key_breakdown))
        .route("/heatmap", get(api_observability::get_heatmap))
        .route("/top-consumers", get(api_observability::get_top_consumers))
        .route("/rate-limits", get(api_observability::list_rate_limits))
        .route(
            "/rate-limits/{key_id}/history",
            get(api_observability::get_rate_limit_history),
        )
        .route(
            "/sample-payloads",
            get(api_observability::list_sample_payloads),
        )
}

/// API alert configuration admin routes.
///
/// ```text
/// GET    /   -> list_alerts
/// POST   /   -> create_alert
/// PUT    /{id} -> update_alert
/// DELETE /{id} -> delete_alert
/// ```
pub fn alerts_router() -> Router<AppState> {
    Router::new()
        .route(
            "/",
            get(api_observability::list_alerts).post(api_observability::create_alert),
        )
        .route(
            "/{id}",
            put(api_observability::update_alert).delete(api_observability::delete_alert),
        )
}
