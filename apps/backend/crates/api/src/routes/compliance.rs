//! Route definitions for compliance rules and checks (PRD-102).
//!
//! Two routers are provided:
//! - `compliance_rule_router()`: top-level CRUD for `/compliance-rules`
//! - `compliance_check_router()`: scene-scoped check routes merged into `/scenes`

use axum::routing::{get, post};
use axum::Router;

use crate::handlers::compliance;
use crate::state::AppState;

/// Top-level compliance rule CRUD routes, nested under `/compliance-rules`.
///
/// ```text
/// GET    /                   list_rules
/// POST   /                   create_rule
/// GET    /{id}               get_rule
/// PUT    /{id}               update_rule
/// DELETE /{id}               delete_rule
/// ```
pub fn compliance_rule_router() -> Router<AppState> {
    Router::new()
        .route(
            "/",
            get(compliance::list_rules).post(compliance::create_rule),
        )
        .route(
            "/{id}",
            get(compliance::get_rule)
                .put(compliance::update_rule)
                .delete(compliance::delete_rule),
        )
}

/// Scene-scoped compliance check routes, merged into `/scenes`.
///
/// ```text
/// POST   /{scene_id}/compliance-check     run_compliance_check
/// GET    /{scene_id}/compliance-checks    list_scene_checks
/// GET    /{scene_id}/compliance-summary   get_scene_summary
/// ```
pub fn compliance_check_router() -> Router<AppState> {
    Router::new()
        .route(
            "/{scene_id}/compliance-check",
            post(compliance::run_compliance_check),
        )
        .route(
            "/{scene_id}/compliance-checks",
            get(compliance::list_scene_checks),
        )
        .route(
            "/{scene_id}/compliance-summary",
            get(compliance::get_scene_summary),
        )
}
