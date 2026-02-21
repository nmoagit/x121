//! Route definitions for user onboarding (PRD-53).
//!
//! Mounted at `/user/onboarding` by `api_routes()`.

use axum::routing::{get, post};
use axum::Router;

use crate::handlers::onboarding;
use crate::state::AppState;

/// Onboarding routes.
///
/// ```text
/// GET    /           -> get_onboarding (get or create)
/// PUT    /           -> update_onboarding (partial update)
/// POST   /reset      -> reset_onboarding (reset to defaults)
/// ```
pub fn router() -> Router<AppState> {
    Router::new()
        .route(
            "/",
            get(onboarding::get_onboarding).put(onboarding::update_onboarding),
        )
        .route("/reset", post(onboarding::reset_onboarding))
}
