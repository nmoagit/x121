//! Route definitions for the `/jobs` resource (PRD-07, extended by PRD-08).
//!
//! All endpoints require authentication.

use axum::routing::{get, post};
use axum::Router;

use crate::handlers::jobs;
use crate::handlers::jobs_admin;
use crate::state::AppState;

/// Routes mounted at `/jobs`.
///
/// ```text
/// GET    /                    -> list_jobs
/// POST   /                    -> submit_job
/// GET    /{id}                -> get_job
/// POST   /{id}/cancel         -> cancel_job
/// POST   /{id}/retry          -> retry_job
/// POST   /{id}/pause          -> pause_job       (PRD-08)
/// POST   /{id}/resume         -> resume_job      (PRD-08)
/// GET    /{id}/transitions    -> get_job_transitions (PRD-08)
/// ```
pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", get(jobs::list_jobs).post(jobs::submit_job))
        .route("/{id}", get(jobs::get_job))
        .route("/{id}/cancel", post(jobs::cancel_job))
        .route("/{id}/retry", post(jobs::retry_job))
        .route("/{id}/pause", post(jobs::pause_job))
        .route("/{id}/resume", post(jobs::resume_job))
        .route("/{id}/transitions", get(jobs::get_job_transitions))
}

/// Admin routes for job management (PRD-132).
///
/// ```text
/// POST   /jobs/{id}/reassign             -> reassign_job
/// POST   /jobs/{id}/hold                 -> hold_job         (Phase 6)
/// POST   /jobs/{id}/release              -> release_job      (Phase 6)
/// POST   /jobs/{id}/move-to-front        -> move_to_front    (Phase 6)
/// POST   /jobs/bulk-cancel               -> bulk_cancel      (Phase 6)
/// POST   /jobs/redistribute              -> redistribute     (Phase 6)
/// GET    /queue/stats                    -> queue_stats      (Phase 7)
/// GET    /queue/jobs                     -> list_admin_queue  (Phase 7)
/// GET    /comfyui/instances              -> list_comfyui_instances
/// POST   /comfyui/{id}/drain             -> drain_instance
/// POST   /comfyui/{id}/undrain           -> undrain_instance
/// ```
pub fn admin_router() -> Router<AppState> {
    Router::new()
        // Job management (Phase 4-6).
        .route("/jobs/{id}/reassign", post(jobs_admin::reassign_job))
        .route("/jobs/{id}/hold", post(jobs_admin::hold_job))
        .route("/jobs/{id}/release", post(jobs_admin::release_job))
        .route("/jobs/{id}/move-to-front", post(jobs_admin::move_to_front))
        .route("/jobs/bulk-cancel", post(jobs_admin::bulk_cancel))
        .route("/jobs/redistribute", post(jobs_admin::redistribute))
        // Queue statistics & enhanced listing (Phase 7).
        .route("/queue/stats", get(jobs_admin::queue_stats))
        .route("/queue/jobs", get(jobs_admin::list_admin_queue))
        // ComfyUI instance management (Phase 5).
        .route("/comfyui/instances", get(jobs_admin::list_comfyui_instances))
        .route("/comfyui/{id}/drain", post(jobs_admin::drain_instance))
        .route("/comfyui/{id}/undrain", post(jobs_admin::undrain_instance))
}
