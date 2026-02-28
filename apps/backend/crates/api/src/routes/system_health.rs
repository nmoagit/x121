//! Route definitions for the System Health Page (PRD-80).
//!
//! Mounted at `/admin/health` by `api_routes()`.

use axum::routing::{get, post, put};
use axum::Router;

use crate::handlers::system_health;
use crate::state::AppState;

/// System health admin routes.
///
/// ```text
/// GET    /statuses              -> get_all_statuses
/// GET    /services/{service}    -> get_service_detail
/// GET    /uptime                -> get_uptime
/// GET    /startup               -> get_startup_checklist
/// POST   /recheck/{service}     -> recheck_service
/// GET    /alerts                -> list_alert_configs
/// PUT    /alerts/{service}      -> update_alert_config
/// ```
pub fn router() -> Router<AppState> {
    Router::new()
        .route("/statuses", get(system_health::get_all_statuses))
        .route(
            "/services/{service}",
            get(system_health::get_service_detail),
        )
        .route("/uptime", get(system_health::get_uptime))
        .route("/startup", get(system_health::get_startup_checklist))
        .route("/recheck/{service}", post(system_health::recheck_service))
        .route("/alerts", get(system_health::list_alert_configs))
        .route("/alerts/{service}", put(system_health::update_alert_config))
}
