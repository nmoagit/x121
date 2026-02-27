//! Routes for admin naming rules (PRD-116).

use axum::routing::{get, post};
use axum::Router;

use crate::handlers;
use crate::state::AppState;

/// Naming rules routes, intended to be nested under `/admin/naming`.
pub fn router() -> Router<AppState> {
    Router::new()
        .route("/categories", get(handlers::naming::list_categories))
        .route(
            "/categories/{id}/tokens",
            get(handlers::naming::list_category_tokens),
        )
        .route(
            "/rules",
            get(handlers::naming::list_rules).post(handlers::naming::create_rule),
        )
        .route(
            "/rules/{id}",
            get(handlers::naming::get_rule)
                .put(handlers::naming::update_rule)
                .delete(handlers::naming::delete_rule),
        )
        .route("/rules/{id}/history", get(handlers::naming::rule_history))
        .route("/preview", post(handlers::naming::preview))
}
