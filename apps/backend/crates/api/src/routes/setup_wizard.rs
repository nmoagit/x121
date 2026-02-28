//! Route definitions for Platform Setup Wizard (PRD-105).
//!
//! ```text
//! ADMIN SETUP:
//! GET    /status                    get_wizard_status
//! POST   /step/{step_name}         execute_step
//! POST   /test-connection           test_connection
//! POST   /skip                      skip_wizard
//! POST   /step/{step_name}/reset   reset_step
//! GET    /step/{step_name}         get_step_config
//! ```

use axum::routing::{get, post};
use axum::Router;

use crate::handlers::setup_wizard;
use crate::state::AppState;

/// Admin setup wizard routes -- mounted at `/admin/setup`.
pub fn setup_wizard_router() -> Router<AppState> {
    Router::new()
        .route("/status", get(setup_wizard::get_wizard_status))
        .route(
            "/step/{step_name}",
            post(setup_wizard::execute_step).get(setup_wizard::get_step_config),
        )
        .route("/test-connection", post(setup_wizard::test_connection))
        .route("/skip", post(setup_wizard::skip_wizard))
        .route("/step/{step_name}/reset", post(setup_wizard::reset_step))
}
