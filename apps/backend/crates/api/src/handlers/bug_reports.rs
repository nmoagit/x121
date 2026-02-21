//! Handlers for bug reporting (PRD-44).
//!
//! Provides endpoints for submitting, listing, retrieving, and triaging
//! bug reports. All endpoints require authentication; status updates
//! require admin role.

use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;

use trulience_core::bug_report;
use trulience_core::error::CoreError;
use trulience_core::roles::ROLE_ADMIN;
use trulience_core::search::{clamp_limit, clamp_offset};
use trulience_core::types::DbId;
use trulience_db::models::bug_report::{
    BugReportListParams, CreateBugReport, UpdateBugReportStatus,
};
use trulience_db::repositories::BugReportRepo;

use crate::error::{AppError, AppResult};
use crate::middleware::auth::AuthUser;
use crate::middleware::rbac::RequireAdmin;
use crate::response::DataResponse;
use crate::state::AppState;

// ---------------------------------------------------------------------------
// POST /bug-reports
// ---------------------------------------------------------------------------

/// Submit a new bug report with browser context.
pub async fn submit_bug_report(
    auth: AuthUser,
    State(state): State<AppState>,
    Json(input): Json<CreateBugReport>,
) -> AppResult<impl IntoResponse> {
    // Validate description length if provided.
    if let Some(ref desc) = input.description {
        bug_report::validate_description(desc)?;
    }

    let report = BugReportRepo::create(&state.pool, auth.user_id, &input).await?;

    tracing::info!(
        bug_report_id = report.id,
        user_id = auth.user_id,
        "Bug report submitted",
    );

    Ok((StatusCode::CREATED, Json(DataResponse { data: report })))
}

// ---------------------------------------------------------------------------
// GET /bug-reports
// ---------------------------------------------------------------------------

/// List bug reports with optional status and user_id filters.
///
/// Admins see all reports. Non-admin users see only their own reports.
pub async fn list_bug_reports(
    auth: AuthUser,
    State(state): State<AppState>,
    Query(params): Query<BugReportListParams>,
) -> AppResult<impl IntoResponse> {
    // Validate status filter if provided.
    if let Some(ref s) = params.status {
        bug_report::validate_status(s)?;
    }

    let limit = clamp_limit(params.limit, 50, 200);
    let offset = clamp_offset(params.offset);

    // Non-admin users can only see their own reports.
    let effective_user_id = if auth.role == ROLE_ADMIN {
        params.user_id
    } else {
        Some(auth.user_id)
    };

    let reports = BugReportRepo::list_filtered(
        &state.pool,
        params.status.as_deref(),
        effective_user_id,
        limit,
        offset,
    )
    .await?;

    Ok(Json(DataResponse { data: reports }))
}

// ---------------------------------------------------------------------------
// GET /bug-reports/:id
// ---------------------------------------------------------------------------

/// Get a single bug report by ID.
///
/// Admins can view any report. Non-admin users can only view their own.
pub async fn get_bug_report(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let report = BugReportRepo::find_by_id(&state.pool, id)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "BugReport",
            id,
        }))?;

    // Non-admin users can only view their own reports.
    if auth.role != ROLE_ADMIN && report.user_id != auth.user_id {
        return Err(AppError::Core(CoreError::Forbidden(
            "You can only view your own bug reports".into(),
        )));
    }

    Ok(Json(DataResponse { data: report }))
}

// ---------------------------------------------------------------------------
// PUT /bug-reports/:id/status
// ---------------------------------------------------------------------------

/// Update the triage status of a bug report. Admin only.
pub async fn update_bug_report_status(
    RequireAdmin(admin): RequireAdmin,
    State(state): State<AppState>,
    Path(id): Path<DbId>,
    Json(input): Json<UpdateBugReportStatus>,
) -> AppResult<impl IntoResponse> {
    // Validate the target status value.
    bug_report::validate_status(&input.status)?;

    // Fetch the current report to check the transition.
    let current = BugReportRepo::find_by_id(&state.pool, id)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "BugReport",
            id,
        }))?;

    // Validate the status transition.
    bug_report::validate_transition(&current.status, &input.status)?;

    let updated = BugReportRepo::update_status(&state.pool, id, &input.status)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "BugReport",
            id,
        }))?;

    tracing::info!(
        bug_report_id = id,
        from = %current.status,
        to = %input.status,
        user_id = admin.user_id,
        "Bug report status updated",
    );

    Ok(Json(DataResponse { data: updated }))
}
