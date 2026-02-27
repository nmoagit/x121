//! Handler for the system status footer bar (PRD-117).
//!
//! Returns a cached health snapshot for the footer. Admin users receive
//! full service and cloud GPU details; non-admin users only see job
//! counts and workflow status.

use axum::extract::State;
use axum::Json;
use serde::Serialize;

use x121_core::roles::ROLE_ADMIN;
use x121_db::repositories::JobRepo;

use crate::engine::health_aggregator::{CloudGpuStatus, FooterServices, WorkflowStatus};
use crate::error::AppResult;
use crate::middleware::auth::AuthUser;
use crate::response::DataResponse;
use crate::state::AppState;

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

/// Top-level response for `GET /api/v1/status/footer`.
#[derive(Debug, Serialize)]
pub struct FooterStatusResponse {
    /// Per-service health breakdown (admin-only; `None` for non-admins).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub services: Option<FooterServices>,
    /// Cloud GPU summary (admin-only; `None` for non-admins).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cloud_gpu: Option<CloudGpuStatus>,
    /// Background job counts (visible to all authenticated users).
    pub jobs: FooterJobsResponse,
    /// Workflow summary (visible to all authenticated users).
    pub workflows: WorkflowStatus,
}

/// Job queue summary for the footer bar.
#[derive(Debug, Serialize)]
pub struct FooterJobsResponse {
    /// Number of currently running jobs.
    pub running: u32,
    /// Number of pending (queued) jobs.
    pub queued: u32,
    /// Rough overall progress percentage (0-100).
    pub overall_progress: u32,
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

/// `GET /api/v1/status/footer`
///
/// Returns the cached system health snapshot for the footer bar.
/// Admin users see service details and cloud GPU status.
/// All authenticated users see job counts and workflow status.
pub async fn get_footer_status(
    State(state): State<AppState>,
    auth: AuthUser,
) -> AppResult<Json<DataResponse<FooterStatusResponse>>> {
    let snapshot = state.health_aggregator.snapshot().await;

    let is_admin = auth.role == ROLE_ADMIN;

    // Fetch live job counts from the database.
    let (pending, running, _scheduled) = JobRepo::queue_counts(&state.pool)
        .await
        .unwrap_or((0, 0, 0));

    let total_active = pending + running;
    let overall_progress = if total_active > 0 {
        // Rough heuristic: running / (running + queued) * 100.
        ((running as f64 / total_active as f64) * 100.0) as u32
    } else {
        0
    };

    let response = FooterStatusResponse {
        services: if is_admin {
            Some(snapshot.services)
        } else {
            None
        },
        cloud_gpu: if is_admin {
            Some(snapshot.cloud_gpu)
        } else {
            None
        },
        jobs: FooterJobsResponse {
            running: running as u32,
            queued: pending as u32,
            overall_progress,
        },
        workflows: snapshot.workflows,
    };

    Ok(Json(DataResponse { data: response }))
}
