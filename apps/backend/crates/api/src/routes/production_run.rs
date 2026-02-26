//! Route definitions for the Batch Production Orchestrator (PRD-57).
//!
//! ```text
//! PRODUCTION RUNS:
//! POST   /                              create_run
//! GET    /                              list_runs (?project_id, limit, offset)
//! GET    /{id}                          get_run
//! GET    /{id}/matrix                   get_matrix
//! POST   /{id}/submit                   submit_cells
//! POST   /{id}/resubmit-failed          resubmit_failed
//! POST   /{id}/deliver                  deliver_run
//! GET    /{id}/progress                 get_progress
//! DELETE /{id}                          delete_run
//! ```

use axum::routing::{get, post};
use axum::Router;

use crate::handlers::production_run;
use crate::state::AppState;

/// Production run routes — mounted at `/production-runs`.
pub fn router() -> Router<AppState> {
    Router::new()
        .route(
            "/",
            get(production_run::list_runs).post(production_run::create_run),
        )
        .route(
            "/{id}",
            get(production_run::get_run).delete(production_run::delete_run),
        )
        .route("/{id}/matrix", get(production_run::get_matrix))
        .route("/{id}/submit", post(production_run::submit_cells))
        .route(
            "/{id}/resubmit-failed",
            post(production_run::resubmit_failed),
        )
        .route("/{id}/deliver", post(production_run::deliver_run))
        .route("/{id}/progress", get(production_run::get_progress))
}
