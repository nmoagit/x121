//! Routes for the system status footer bar (PRD-117).

use axum::routing::get;
use axum::Router;

use crate::handlers;
use crate::state::AppState;

/// Footer status routes, intended to be nested under `/status`.
pub fn router() -> Router<AppState> {
    Router::new().route("/footer", get(handlers::status::get_footer_status))
}
