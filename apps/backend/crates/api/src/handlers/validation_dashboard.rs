//! Handlers for validation dashboard endpoints (PRD-113).
//!
//! Provides project-level validation summaries.

use axum::extract::{Path, State};
use axum::Json;
use serde::Serialize;
use x121_core::types::DbId;
use x121_db::repositories::AvatarIngestSessionRepo;

use crate::error::AppResult;
use crate::state::AppState;

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

/// Summary of validation status across all ingest sessions for a project.
#[derive(Debug, Serialize)]
pub struct ProjectValidationSummary {
    pub project_id: DbId,
    pub total_sessions: i64,
    pub active_sessions: i64,
    pub completed_sessions: i64,
    pub failed_sessions: i64,
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/// GET /api/v1/projects/{id}/validation-summary
///
/// Returns a high-level validation summary for the project's ingest sessions.
pub async fn get_validation_summary(
    State(state): State<AppState>,
    Path(project_id): Path<DbId>,
) -> AppResult<Json<ProjectValidationSummary>> {
    let sessions = AvatarIngestSessionRepo::list_by_project(&state.pool, project_id).await?;

    let total_sessions = sessions.len() as i64;
    let completed_sessions = sessions.iter().filter(|s| s.status_id == 6).count() as i64;
    let failed_sessions = sessions.iter().filter(|s| s.status_id == 7).count() as i64;
    let active_sessions = total_sessions
        - completed_sessions
        - failed_sessions
        - sessions.iter().filter(|s| s.status_id == 8).count() as i64;

    Ok(Json(ProjectValidationSummary {
        project_id,
        total_sessions,
        active_sessions,
        completed_sessions,
        failed_sessions,
    }))
}

/// POST /api/v1/projects/{id}/validate
///
/// Trigger revalidation of the project's active ingest sessions.
/// Currently returns the summary; full revalidation is triggered per-session.
pub async fn revalidate_project(
    State(state): State<AppState>,
    Path(project_id): Path<DbId>,
) -> AppResult<Json<ProjectValidationSummary>> {
    // For now, just return the current summary. Full revalidation would
    // iterate sessions and call the validation logic.
    get_validation_summary(State(state), Path(project_id)).await
}
