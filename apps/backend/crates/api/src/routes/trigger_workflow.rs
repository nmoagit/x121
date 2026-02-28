//! Route definitions for Trigger Workflows (PRD-97).
//!
//! ```text
//! ADMIN TRIGGERS:
//! GET    /                  list_triggers (?project_id, limit, offset)
//! POST   /                  create_trigger
//! GET    /log               list_trigger_logs (?limit, offset)
//! GET    /chain-graph       get_chain_graph (?project_id)
//! POST   /pause-all         pause_all_triggers
//! POST   /resume-all        resume_all_triggers
//! GET    /{id}              get_trigger (with stats)
//! PUT    /{id}              update_trigger
//! DELETE /{id}              delete_trigger
//! POST   /{id}/dry-run      dry_run_trigger
//! ```

use axum::routing::{get, post};
use axum::Router;

use crate::handlers::trigger_workflow;
use crate::state::AppState;

/// Admin trigger routes -- mounted at `/admin/triggers`.
pub fn admin_router() -> Router<AppState> {
    Router::new()
        .route(
            "/",
            get(trigger_workflow::list_triggers).post(trigger_workflow::create_trigger),
        )
        .route("/log", get(trigger_workflow::list_trigger_logs))
        .route("/chain-graph", get(trigger_workflow::get_chain_graph))
        .route("/pause-all", post(trigger_workflow::pause_all_triggers))
        .route("/resume-all", post(trigger_workflow::resume_all_triggers))
        .route(
            "/{id}",
            get(trigger_workflow::get_trigger)
                .put(trigger_workflow::update_trigger)
                .delete(trigger_workflow::delete_trigger),
        )
        .route("/{id}/dry-run", post(trigger_workflow::dry_run_trigger))
}
