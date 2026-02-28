//! Route definitions for Workflow Regression Testing (PRD-65).
//!
//! ```text
//! REFERENCES:
//! POST   /references                        create_reference
//! GET    /references                        list_references
//! GET    /references/{id}                   get_reference
//! DELETE /references/{id}                   delete_reference
//!
//! RUNS:
//! POST   /runs                              trigger_run
//! GET    /runs                              list_runs
//! GET    /runs/{id}/report                  get_run_report
//! GET    /runs/{id}/results/{result_id}     get_run_result
//! ```

use axum::routing::get;
use axum::Router;

use crate::handlers::regression;
use crate::state::AppState;

/// Regression testing routes -- mounted at `/regression`.
pub fn regression_router() -> Router<AppState> {
    Router::new()
        .route(
            "/references",
            get(regression::list_references).post(regression::create_reference),
        )
        .route(
            "/references/{id}",
            get(regression::get_reference).delete(regression::delete_reference),
        )
        .route(
            "/runs",
            get(regression::list_runs).post(regression::trigger_run),
        )
        .route("/runs/{id}/report", get(regression::get_run_report))
        .route(
            "/runs/{id}/results/{result_id}",
            get(regression::get_run_result),
        )
}
