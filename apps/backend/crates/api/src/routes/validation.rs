//! Route definitions for the `/validation` and `/imports` resources.

use axum::routing::{get, post, put};
use axum::Router;

use crate::handlers::validation;
use crate::state::AppState;

/// Routes mounted at `/validation`.
///
/// ```text
/// GET    /rule-types   -> list_rule_types
/// GET    /rules        -> list_rules   (?entity_type, ?project_id)
/// POST   /rules        -> create_rule
/// PUT    /rules/{id}   -> update_rule
/// DELETE /rules/{id}   -> delete_rule
/// POST   /validate     -> validate     (dry-run)
/// ```
pub fn validation_router() -> Router<AppState> {
    Router::new()
        .route("/rule-types", get(validation::list_rule_types))
        .route(
            "/rules",
            get(validation::list_rules).post(validation::create_rule),
        )
        .route(
            "/rules/{id}",
            put(validation::update_rule).delete(validation::delete_rule),
        )
        .route("/validate", post(validation::validate))
}

/// Routes mounted at `/imports`.
///
/// ```text
/// GET    /                  -> list_imports     (?entity_type, ?project_id)
/// POST   /{id}/commit       -> commit_import
/// GET    /{id}/report        -> get_report       (JSON)
/// GET    /{id}/report/csv    -> get_report_csv   (CSV)
/// ```
pub fn imports_router() -> Router<AppState> {
    Router::new()
        .route("/", get(validation::list_imports))
        .route("/{id}/commit", post(validation::commit_import))
        .route("/{id}/report", get(validation::get_report))
        .route("/{id}/report/csv", get(validation::get_report_csv))
}
