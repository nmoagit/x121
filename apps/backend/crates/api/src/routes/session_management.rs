//! Routes for session management (PRD-98).
//!
//! Admin routes nested at `/admin/sessions`, user routes at `/sessions`.

use axum::routing::{delete, get, post, put};
use axum::Router;

use crate::handlers;
use crate::state::AppState;

/// Admin session management routes, intended to be nested under `/admin/sessions`.
pub fn admin_router() -> Router<AppState> {
    Router::new()
        .route("/", get(handlers::session_management::list_active_sessions))
        .route(
            "/{id}",
            delete(handlers::session_management::force_terminate_session),
        )
        .route(
            "/analytics",
            get(handlers::session_management::get_session_analytics),
        )
        .route(
            "/login-history",
            get(handlers::session_management::get_login_history),
        )
        .route(
            "/config",
            get(handlers::session_management::list_session_configs),
        )
        .route(
            "/config/{key}",
            put(handlers::session_management::update_session_config),
        )
}

/// User session routes, intended to be nested under `/sessions`.
pub fn user_router() -> Router<AppState> {
    Router::new()
        .route("/heartbeat", post(handlers::session_management::heartbeat))
        .route("/me", get(handlers::session_management::get_my_sessions))
}
