//! Route definitions for time-based job scheduling (PRD-119).
//!
//! Mounted at `/schedules` by `api_routes()`.

use axum::routing::{get, post};
use axum::Router;

use crate::handlers::job_scheduling;
use crate::state::AppState;

/// Schedule management routes (requires auth).
///
/// ```text
/// POST   /                  -> create_schedule
/// GET    /                  -> list_schedules
/// GET    /off-peak          -> get_off_peak_config (admin only)
/// PUT    /off-peak          -> update_off_peak_config (admin only)
/// GET    /{id}              -> get_schedule
/// PUT    /{id}              -> update_schedule
/// DELETE /{id}              -> delete_schedule
/// POST   /{id}/pause        -> pause_schedule
/// POST   /{id}/resume       -> resume_schedule
/// GET    /{id}/history      -> list_schedule_history
/// ```
pub fn router() -> Router<AppState> {
    Router::new()
        .route(
            "/",
            post(job_scheduling::create_schedule).get(job_scheduling::list_schedules),
        )
        .route(
            "/off-peak",
            get(job_scheduling::get_off_peak_config).put(job_scheduling::update_off_peak_config),
        )
        .route(
            "/{id}",
            get(job_scheduling::get_schedule)
                .put(job_scheduling::update_schedule)
                .delete(job_scheduling::delete_schedule),
        )
        .route("/{id}/pause", post(job_scheduling::pause_schedule))
        .route("/{id}/resume", post(job_scheduling::resume_schedule))
        .route("/{id}/history", get(job_scheduling::list_schedule_history))
}
