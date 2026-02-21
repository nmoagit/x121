//! Route definitions for audit logging & compliance (PRD-45).

use axum::routing::{get, put};
use axum::Router;

use crate::handlers::audit;
use crate::state::AppState;

/// Audit routes mounted at `/admin/audit-logs`.
///
/// All routes require the `admin` role (enforced by handler extractors).
///
/// ```text
/// GET  /                       -> query_audit_logs
/// GET  /export                 -> export_audit_logs
/// GET  /integrity-check        -> check_integrity
/// GET  /retention              -> list_retention_policies
/// PUT  /retention/{category}   -> update_retention_policy
/// ```
pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", get(audit::query_audit_logs))
        .route("/export", get(audit::export_audit_logs))
        .route("/integrity-check", get(audit::check_integrity))
        .route("/retention", get(audit::list_retention_policies))
        .route(
            "/retention/{category}",
            put(audit::update_retention_policy),
        )
}
