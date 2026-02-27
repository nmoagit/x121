//! Routes for admin platform settings (PRD-110).

use axum::routing::{get, post};
use axum::Router;

use crate::handlers;
use crate::state::AppState;

/// Platform settings routes, intended to be nested under `/admin/settings`.
pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", get(handlers::platform_settings::list_settings))
        .route(
            "/{key}",
            get(handlers::platform_settings::get_setting)
                .patch(handlers::platform_settings::update_setting)
                .delete(handlers::platform_settings::reset_setting),
        )
        .route(
            "/{key}/actions/test",
            post(handlers::platform_settings::test_connection),
        )
}
