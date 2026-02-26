//! Route definitions for Pipeline Stage Hooks (PRD-77).
//!
//! ```text
//! HOOKS:
//! POST   /                                  create_hook
//! GET    /                                  list_hooks (?scope_type, scope_id, hook_point, enabled)
//! GET    /{id}                              get_hook
//! PUT    /{id}                              update_hook
//! DELETE /{id}                              delete_hook
//! PATCH  /{id}/toggle                       toggle_hook
//! POST   /{id}/test                         test_hook
//! GET    /{id}/logs                         list_hook_logs (?limit, offset)
//! GET    /effective/{scope_type}/{scope_id}  get_effective_hooks (?hook_point)
//!
//! JOB HOOK LOGS (merged into /jobs):
//! GET    /{job_id}/hook-logs                list_job_hook_logs
//! ```

use axum::routing::{get, post};
use axum::Router;

use crate::handlers::pipeline_hooks;
use crate::state::AppState;

/// Hook routes -- mounted at `/hooks`.
pub fn hooks_router() -> Router<AppState> {
    Router::new()
        .route(
            "/",
            post(pipeline_hooks::create_hook).get(pipeline_hooks::list_hooks),
        )
        .route(
            "/{id}",
            get(pipeline_hooks::get_hook)
                .put(pipeline_hooks::update_hook)
                .delete(pipeline_hooks::delete_hook),
        )
        .route(
            "/{id}/toggle",
            axum::routing::patch(pipeline_hooks::toggle_hook),
        )
        .route("/{id}/test", post(pipeline_hooks::test_hook))
        .route("/{id}/logs", get(pipeline_hooks::list_hook_logs))
        .route(
            "/effective/{scope_type}/{scope_id}",
            get(pipeline_hooks::get_effective_hooks),
        )
}

/// Job hook-log routes -- merged into the `/jobs` nest.
pub fn job_hooks_router() -> Router<AppState> {
    Router::new().route(
        "/{job_id}/hook-logs",
        get(pipeline_hooks::list_job_hook_logs),
    )
}
