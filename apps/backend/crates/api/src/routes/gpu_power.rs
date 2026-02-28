//! Route definitions for GPU power management (PRD-87).
//!
//! All routes are admin-only, nested at `/admin/power`.

use axum::routing::{get, post};
use axum::Router;

use crate::handlers::gpu_power;
use crate::state::AppState;

/// Admin routes mounted at `/admin/power`.
///
/// All routes require the `admin` role (enforced by handler extractors).
///
/// ```text
/// POST   /schedules              -> set_power_schedule
/// GET    /schedules/{id}         -> get_power_schedule
/// PUT    /schedules/{id}         -> update_power_schedule
/// DELETE /schedules/{id}         -> delete_power_schedule
/// GET    /workers/status         -> list_worker_power_statuses
/// POST   /workers/{id}/wake      -> wake_worker
/// POST   /workers/{id}/shutdown  -> shutdown_worker
/// GET    /workers/{id}/status    -> get_power_status
/// GET    /fleet                  -> get_fleet_settings
/// PUT    /fleet                  -> update_fleet_settings
/// GET    /consumption            -> get_consumption_summary
/// ```
pub fn router() -> Router<AppState> {
    Router::new()
        // Schedule CRUD
        .route("/schedules", post(gpu_power::set_power_schedule))
        .route(
            "/schedules/{id}",
            get(gpu_power::get_power_schedule)
                .put(gpu_power::update_power_schedule)
                .delete(gpu_power::delete_power_schedule),
        )
        // Worker power commands
        .route("/workers/status", get(gpu_power::list_worker_power_statuses))
        .route("/workers/{id}/wake", post(gpu_power::wake_worker))
        .route("/workers/{id}/shutdown", post(gpu_power::shutdown_worker))
        .route("/workers/{id}/status", get(gpu_power::get_power_status))
        // Fleet settings
        .route(
            "/fleet",
            get(gpu_power::get_fleet_settings).put(gpu_power::update_fleet_settings),
        )
        // Consumption summary
        .route("/consumption", get(gpu_power::get_consumption_summary))
}
