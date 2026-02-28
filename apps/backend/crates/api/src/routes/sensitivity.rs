//! Route definitions for content sensitivity controls (PRD-82).
//!
//! Two routers are provided:
//! - `user_router()` for user-facing sensitivity preference routes at `/user/sensitivity`
//! - `admin_router()` for admin studio sensitivity defaults at `/admin/sensitivity-defaults`

use axum::routing::get;
use axum::Router;

use crate::handlers::sensitivity;
use crate::state::AppState;

/// User sensitivity preference routes mounted at `/user/sensitivity`.
///
/// ```text
/// GET /  -> get_user_sensitivity
/// PUT /  -> update_user_sensitivity
/// ```
pub fn user_router() -> Router<AppState> {
    Router::new().route(
        "/",
        get(sensitivity::get_user_sensitivity).put(sensitivity::update_user_sensitivity),
    )
}

/// Admin studio sensitivity defaults routes mounted at `/admin/sensitivity-defaults`.
///
/// ```text
/// GET /  -> get_admin_sensitivity_defaults
/// PUT /  -> update_admin_sensitivity_defaults
/// ```
pub fn admin_router() -> Router<AppState> {
    Router::new().route(
        "/",
        get(sensitivity::get_admin_sensitivity_defaults)
            .put(sensitivity::update_admin_sensitivity_defaults),
    )
}
