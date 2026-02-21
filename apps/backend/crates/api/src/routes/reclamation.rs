//! Route definitions for the `/admin/reclamation` resource (PRD-15).

use axum::routing::{get, post, put};
use axum::Router;

use crate::handlers::reclamation;
use crate::state::AppState;

/// Routes mounted at `/admin/reclamation`.
///
/// All routes require the `admin` role (enforced by handler extractors).
///
/// ```text
/// GET    /preview                     -> preview reclaimable space
/// POST   /run                         -> trigger cleanup
/// GET    /trash                       -> list trash queue entries
/// POST   /trash/{id}/restore          -> restore a trash entry
/// GET    /history                     -> list cleanup history
/// GET    /protection-rules            -> list protection rules
/// POST   /protection-rules            -> create protection rule
/// PUT    /protection-rules/{id}       -> update protection rule
/// DELETE /protection-rules/{id}       -> delete protection rule
/// GET    /policies                    -> list reclamation policies
/// POST   /policies                    -> create reclamation policy
/// PUT    /policies/{id}               -> update reclamation policy
/// DELETE /policies/{id}               -> delete reclamation policy
/// ```
pub fn router() -> Router<AppState> {
    Router::new()
        .route("/preview", get(reclamation::preview))
        .route("/run", post(reclamation::run_cleanup))
        .route("/trash", get(reclamation::list_trash))
        .route("/trash/{id}/restore", post(reclamation::restore_trash))
        .route("/history", get(reclamation::list_runs))
        .route(
            "/protection-rules",
            get(reclamation::list_protection_rules).post(reclamation::create_protection_rule),
        )
        .route(
            "/protection-rules/{id}",
            put(reclamation::update_protection_rule).delete(reclamation::delete_protection_rule),
        )
        .route(
            "/policies",
            get(reclamation::list_policies).post(reclamation::create_policy),
        )
        .route(
            "/policies/{id}",
            put(reclamation::update_policy).delete(reclamation::delete_policy),
        )
}
