//! Route definitions for the Bulk Character Onboarding Wizard (PRD-67).
//!
//! Mounted at `/onboarding-sessions` by `api_routes()`.
//!
//! ```text
//! POST   /                              create_session
//! GET    /                              list_sessions (?project_id, limit, offset)
//! GET    /{id}                          get_session
//! POST   /{id}/advance                  advance_step
//! POST   /{id}/go-back                  go_back
//! PUT    /{id}/step-data                update_step_data
//! POST   /{id}/abandon                  abandon_session
//! POST   /{id}/complete                 complete_session
//! ```

use axum::routing::{get, post, put};
use axum::Router;

use crate::handlers::onboarding_wizard;
use crate::state::AppState;

/// Onboarding wizard routes — mounted at `/onboarding-sessions`.
pub fn router() -> Router<AppState> {
    Router::new()
        .route(
            "/",
            get(onboarding_wizard::list_sessions).post(onboarding_wizard::create_session),
        )
        .route(
            "/{id}",
            get(onboarding_wizard::get_session),
        )
        .route(
            "/{id}/advance",
            post(onboarding_wizard::advance_step),
        )
        .route(
            "/{id}/go-back",
            post(onboarding_wizard::go_back),
        )
        .route(
            "/{id}/step-data",
            put(onboarding_wizard::update_step_data),
        )
        .route(
            "/{id}/abandon",
            post(onboarding_wizard::abandon_session),
        )
        .route(
            "/{id}/complete",
            post(onboarding_wizard::complete_session),
        )
}
