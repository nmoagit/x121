//! Handlers for project lifecycle management (PRD-72).
//!
//! Provides endpoints for lifecycle transitions, completion checklists,
//! summary reports, and bulk archival.

use axum::extract::{Path, State};
use axum::response::IntoResponse;
use axum::Json;

use x121_core::error::CoreError;
use x121_core::project_lifecycle::{
    self, evaluate_checklist, LifecycleState, ProjectSummaryData, STATE_ARCHIVED, STATE_DELIVERED,
};
use x121_core::types::DbId;
use x121_db::models::project_lifecycle::{
    BulkArchiveRequest, BulkArchiveResponse, TransitionRequest, TransitionResponse,
};
use x121_db::repositories::{ProjectLifecycleRepo, ProjectRepo};

use crate::error::{AppError, AppResult};
use crate::middleware::auth::AuthUser;
use crate::response::DataResponse;
use crate::state::AppState;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Ensure a project exists (non-deleted) or return 404.
async fn ensure_project_exists(pool: &sqlx::PgPool, id: DbId) -> AppResult<()> {
    ProjectRepo::find_by_id(pool, id)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "Project",
            id,
        }))?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/// POST /projects/{project_id}/transition/{state}
///
/// Transition a project to a new lifecycle state. Validates the transition
/// against the state machine, evaluates the completion checklist for
/// `active -> delivered`, and generates a summary report on delivery.
pub async fn transition_project(
    auth: AuthUser,
    State(state): State<AppState>,
    Path((project_id, target_state)): Path<(DbId, String)>,
    Json(request): Json<TransitionRequest>,
) -> AppResult<impl IntoResponse> {
    ensure_project_exists(&state.pool, project_id).await?;

    // Get current status name.
    let current_status = ProjectLifecycleRepo::get_project_status(&state.pool, project_id)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "Project",
            id: project_id,
        }))?;

    // Validate the transition.
    project_lifecycle::validate_transition(&current_status, &target_state)
        .map_err(AppError::BadRequest)?;

    let target = LifecycleState::from_str(&target_state).map_err(AppError::BadRequest)?;

    // If transitioning to delivered, evaluate the completion checklist and
    // generate a summary report. Uses a single aggregates query (DRY-524).
    let mut checklist_result = None;
    let admin_override = request.admin_override.unwrap_or(false);

    if target == LifecycleState::Delivered {
        let agg = ProjectLifecycleRepo::get_project_aggregates(&state.pool, project_id).await?;

        if !admin_override {
            let checklist = evaluate_checklist(
                agg.total_scenes,
                agg.approved_scenes,
                agg.total_avatars,
                agg.avatars_with_metadata,
            );

            if !checklist.passed {
                return Err(AppError::BadRequest(format!(
                    "Completion checklist failed. {} blocking item(s) not met.",
                    checklist
                        .items
                        .iter()
                        .filter(|i| i.blocking && !i.passed)
                        .count()
                )));
            }

            checklist_result = Some(checklist);
        }

        // Resolve the target status ID and perform the transition first.
        let new_status_id = ProjectLifecycleRepo::get_status_id_by_name(&state.pool, &target_state)
            .await?
            .ok_or_else(|| {
                AppError::BadRequest(format!("Status '{target_state}' not found in database"))
            })?;

        let is_edit_locked = target.is_edit_locked();

        ProjectLifecycleRepo::transition(
            &state.pool,
            project_id,
            new_status_id,
            auth.user_id,
            is_edit_locked,
        )
        .await?;

        // Generate summary report.
        let summary_data = ProjectSummaryData {
            total_avatars: agg.total_avatars as i32,
            total_scenes: agg.total_scenes as i32,
            total_segments: agg.total_segments as i32,
            approved_scenes: agg.approved_scenes as i32,
            qa_pass_rate: project_lifecycle::compute_qa_pass_rate(
                agg.approved_scenes,
                agg.total_scenes,
            ),
            regeneration_count: 0, // placeholder until regeneration tracking is wired
            wall_clock_days: 0.0,  // requires created_at lookup; populated via summary query
        };

        let report_json = serde_json::to_value(&summary_data)
            .map_err(|e| AppError::InternalError(format!("Failed to serialize summary: {e}")))?;

        ProjectLifecycleRepo::create_summary(&state.pool, project_id, &report_json, auth.user_id)
            .await?;

        tracing::info!(
            user_id = auth.user_id,
            project_id = project_id,
            from = %current_status,
            to = %target_state,
            admin_override = admin_override,
            "Project lifecycle transition"
        );

        return Ok(Json(DataResponse {
            data: TransitionResponse {
                project_id,
                previous_state: current_status,
                new_state: target_state,
                is_edit_locked,
                checklist: checklist_result,
                summary_generated: true,
            },
        }));
    }

    // Non-delivery transitions: simpler path.
    let new_status_id = ProjectLifecycleRepo::get_status_id_by_name(&state.pool, &target_state)
        .await?
        .ok_or_else(|| {
            AppError::BadRequest(format!("Status '{target_state}' not found in database"))
        })?;

    let is_edit_locked = target.is_edit_locked();

    ProjectLifecycleRepo::transition(
        &state.pool,
        project_id,
        new_status_id,
        auth.user_id,
        is_edit_locked,
    )
    .await?;

    tracing::info!(
        user_id = auth.user_id,
        project_id = project_id,
        from = %current_status,
        to = %target_state,
        admin_override = admin_override,
        "Project lifecycle transition"
    );

    Ok(Json(DataResponse {
        data: TransitionResponse {
            project_id,
            previous_state: current_status,
            new_state: target_state,
            is_edit_locked,
            checklist: None,
            summary_generated: false,
        },
    }))
}

/// GET /projects/{project_id}/completion-checklist
///
/// Evaluate and return the completion checklist for a project without
/// performing any transition.
pub async fn get_checklist(
    _auth: AuthUser,
    State(state): State<AppState>,
    Path(project_id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    ensure_project_exists(&state.pool, project_id).await?;

    let agg = ProjectLifecycleRepo::get_project_aggregates(&state.pool, project_id).await?;

    let checklist = evaluate_checklist(
        agg.total_scenes,
        agg.approved_scenes,
        agg.total_avatars,
        agg.avatars_with_metadata,
    );

    Ok(Json(DataResponse { data: checklist }))
}

/// GET /projects/{project_id}/summary-report
///
/// Get the latest summary report for a project.
pub async fn get_summary(
    _auth: AuthUser,
    State(state): State<AppState>,
    Path(project_id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    ensure_project_exists(&state.pool, project_id).await?;

    let summary = ProjectLifecycleRepo::get_latest_summary(&state.pool, project_id)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "ProjectSummary",
            id: project_id,
        }))?;

    Ok(Json(DataResponse { data: summary }))
}

/// POST /projects/bulk-archive
///
/// Bulk-archive projects that are in the `delivered` state.
pub async fn bulk_archive(
    auth: AuthUser,
    State(state): State<AppState>,
    Json(request): Json<BulkArchiveRequest>,
) -> AppResult<impl IntoResponse> {
    if request.project_ids.is_empty() {
        return Err(AppError::BadRequest(
            "project_ids must not be empty".to_string(),
        ));
    }

    let archived_status_id =
        ProjectLifecycleRepo::get_status_id_by_name(&state.pool, STATE_ARCHIVED)
            .await?
            .ok_or_else(|| {
                AppError::InternalError("Status 'archived' not found in database".to_string())
            })?;

    let delivered_status_id =
        ProjectLifecycleRepo::get_status_id_by_name(&state.pool, STATE_DELIVERED)
            .await?
            .ok_or_else(|| {
                AppError::InternalError("Status 'delivered' not found in database".to_string())
            })?;

    let archived_count = ProjectLifecycleRepo::bulk_archive(
        &state.pool,
        &request.project_ids,
        auth.user_id,
        archived_status_id,
        delivered_status_id,
    )
    .await?;

    // TODO: To report precise failed_ids, query each individually; bulk
    // operations currently trade precision for throughput.
    let failed_ids: Vec<DbId> = Vec::new();

    tracing::info!(
        user_id = auth.user_id,
        requested = request.project_ids.len(),
        archived = archived_count,
        "Bulk archive completed"
    );

    Ok(Json(DataResponse {
        data: BulkArchiveResponse {
            archived_count: archived_count as i64,
            failed_ids,
        },
    }))
}
