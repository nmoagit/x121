//! Handlers for avatar review allocation (PRD-129).
//!
//! Provides endpoints for assigning avatars to reviewers, auto-allocating
//! via round-robin, tracking reviewer workload, submitting review decisions,
//! and querying the avatar review audit log.

use axum::body::Body;
use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde::Deserialize;

use x121_core::error::CoreError;
use x121_core::review_allocation::{self, ReviewerLoad, UnassignedAvatar};
use x121_core::roles::ROLE_ADMIN;
use x121_core::search::{clamp_limit, clamp_offset, DEFAULT_SEARCH_LIMIT, MAX_SEARCH_LIMIT};
use x121_core::types::DbId;
use x121_db::models::avatar_review::{
    AuditLogFilterParams, AutoAllocatePreview, AutoAllocateRequest, AvatarReviewAssignment,
    CreateAvatarAssignment, ProposedAssignment, ReassignAvatarReview, ReviewDecisionRequest,
};
use x121_db::repositories::AvatarReviewRepo;

use crate::error::{AppError, AppResult};
use crate::middleware::auth::AuthUser;
use crate::query::PaginationParams;
use crate::response::DataResponse;
use crate::state::AppState;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Verify the caller has the admin role.
fn require_admin(auth: &AuthUser) -> AppResult<()> {
    if auth.role != ROLE_ADMIN {
        return Err(AppError::Core(CoreError::Forbidden(
            "Admin access required".to_string(),
        )));
    }
    Ok(())
}

/// Parse an optional ISO 8601 deadline string into a `DateTime<Utc>`.
fn parse_deadline(deadline: Option<&str>) -> AppResult<Option<chrono::DateTime<chrono::Utc>>> {
    match deadline {
        Some(s) => {
            let dt = s
                .parse::<chrono::DateTime<chrono::Utc>>()
                .map_err(|e| AppError::BadRequest(format!("Invalid deadline format: {e}")))?;
            Ok(Some(dt))
        }
        None => Ok(None),
    }
}

/// Ensure a review assignment exists by ID, returning it or a 404.
async fn ensure_assignment_exists(
    pool: &sqlx::PgPool,
    id: DbId,
) -> AppResult<AvatarReviewAssignment> {
    AvatarReviewRepo::find_by_id(pool, id)
        .await?
        .ok_or_else(|| {
            AppError::Core(CoreError::NotFound {
                entity: "AvatarReviewAssignment",
                id,
            })
        })
}

// ---------------------------------------------------------------------------
// Query parameter types
// ---------------------------------------------------------------------------

/// Query parameters for the auto-allocate endpoint.
#[derive(Debug, Deserialize)]
pub struct AllocateQueryParams {
    pub preview: Option<bool>,
}

/// Response wrapper for auto-allocate: either a preview or executed assignments.
#[derive(Debug, serde::Serialize)]
#[serde(untagged)]
pub enum AutoAllocateResult {
    /// Preview mode returns proposed assignments without creating them.
    Preview(AutoAllocatePreview),
    /// Execute mode returns the created assignment records.
    Executed(Vec<AvatarReviewAssignment>),
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/// POST /projects/{project_id}/review/assignments
///
/// Assign one or more avatars to a reviewer. Admin only.
pub async fn assign_avatars(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(project_id): Path<DbId>,
    Json(request): Json<CreateAvatarAssignment>,
) -> AppResult<impl IntoResponse> {
    require_admin(&auth)?;

    let deadline = parse_deadline(request.deadline.as_deref())?;
    let mut assignments = Vec::with_capacity(request.avatar_ids.len());

    for avatar_id in &request.avatar_ids {
        let assignment = AvatarReviewRepo::create_assignment(
            &state.pool,
            *avatar_id,
            request.reviewer_user_id,
            auth.user_id,
            1, // first review round
            deadline,
        )
        .await?;

        // Update avatar review status to 'assigned' (2).
        AvatarReviewRepo::update_review_status(&state.pool, *avatar_id, 2).await?;

        // Log audit entry.
        AvatarReviewRepo::log_action(
            &state.pool,
            *avatar_id,
            "assigned",
            auth.user_id,
            Some(request.reviewer_user_id),
            None,
            &serde_json::json!({
                "project_id": project_id,
                "assignment_id": assignment.id,
                "review_round": 1,
            }),
        )
        .await?;

        assignments.push(assignment);
    }

    tracing::info!(
        user_id = auth.user_id,
        project_id = project_id,
        count = assignments.len(),
        reviewer_user_id = request.reviewer_user_id,
        "Avatars assigned for review"
    );

    Ok((
        StatusCode::CREATED,
        Json(DataResponse { data: assignments }),
    ))
}

/// POST /projects/{project_id}/review/auto-allocate
///
/// Auto-allocate unassigned avatars to reviewers using round-robin.
/// Pass `?preview=true` to preview without creating assignments.
pub async fn auto_allocate(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(project_id): Path<DbId>,
    Query(query): Query<AllocateQueryParams>,
    body: Option<Json<AutoAllocateRequest>>,
) -> AppResult<impl IntoResponse> {
    require_admin(&auth)?;

    let exclude_ids = body
        .and_then(|b| b.0.exclude_reviewer_ids)
        .unwrap_or_default();

    // Fetch unassigned avatars for this project.
    let unassigned_rows = AvatarReviewRepo::list_unassigned(&state.pool, project_id).await?;
    let avatars: Vec<UnassignedAvatar> = unassigned_rows
        .into_iter()
        .map(|(id, name)| UnassignedAvatar { id, name })
        .collect();

    // Fetch reviewer workloads.
    let reviewer_rows = AvatarReviewRepo::list_reviewers(&state.pool).await?;
    let mut reviewers: Vec<ReviewerLoad> = reviewer_rows
        .into_iter()
        .filter(|(id, _, _)| !exclude_ids.contains(id))
        .map(|(user_id, username, last_assigned_at)| ReviewerLoad {
            user_id,
            username,
            active_count: 0, // will be populated below
            last_assigned_at,
        })
        .collect();

    // Populate active counts.
    for reviewer in &mut reviewers {
        reviewer.active_count =
            AvatarReviewRepo::count_active_by_reviewer(&state.pool, reviewer.user_id).await?;
    }

    // Run allocation.
    let proposed = review_allocation::allocate_round_robin(&mut reviewers, &avatars);

    let is_preview = query.preview.unwrap_or(false);

    if is_preview {
        let preview = AutoAllocatePreview {
            unassigned_count: avatars.len() as i64,
            reviewer_count: reviewers.len() as i64,
            proposed_assignments: proposed
                .into_iter()
                .map(|p| ProposedAssignment {
                    avatar_id: p.avatar_id,
                    avatar_name: p.avatar_name,
                    reviewer_user_id: p.reviewer_user_id,
                    reviewer_username: p.reviewer_username,
                })
                .collect(),
        };
        return Ok(Json(DataResponse {
            data: AutoAllocateResult::Preview(preview),
        }));
    }

    // Execute: create assignments and update statuses.
    let mut assignments = Vec::with_capacity(proposed.len());
    for p in &proposed {
        let assignment = AvatarReviewRepo::create_assignment(
            &state.pool,
            p.avatar_id,
            p.reviewer_user_id,
            auth.user_id,
            1,
            None,
        )
        .await?;

        AvatarReviewRepo::update_review_status(&state.pool, p.avatar_id, 2).await?;

        AvatarReviewRepo::log_action(
            &state.pool,
            p.avatar_id,
            "assigned",
            auth.user_id,
            Some(p.reviewer_user_id),
            Some("auto-allocated"),
            &serde_json::json!({
                "project_id": project_id,
                "assignment_id": assignment.id,
                "review_round": 1,
            }),
        )
        .await?;

        assignments.push(assignment);
    }

    tracing::info!(
        user_id = auth.user_id,
        project_id = project_id,
        count = assignments.len(),
        "Auto-allocated avatars for review"
    );

    Ok(Json(DataResponse {
        data: AutoAllocateResult::Executed(assignments),
    }))
}

/// GET /projects/{project_id}/review/assignments
///
/// List review assignments for a project. Admin only. Paginated.
pub async fn list_assignments(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(project_id): Path<DbId>,
    Query(pagination): Query<PaginationParams>,
) -> AppResult<impl IntoResponse> {
    require_admin(&auth)?;

    let limit = clamp_limit(pagination.limit, DEFAULT_SEARCH_LIMIT, MAX_SEARCH_LIMIT);
    let offset = clamp_offset(pagination.offset);

    let assignments =
        AvatarReviewRepo::list_by_project(&state.pool, project_id, limit, offset).await?;

    Ok(Json(DataResponse { data: assignments }))
}

/// PATCH /projects/{project_id}/review/assignments/{assignment_id}
///
/// Reassign a avatar review to a different reviewer. Admin only.
pub async fn reassign(
    auth: AuthUser,
    State(state): State<AppState>,
    Path((project_id, assignment_id)): Path<(DbId, DbId)>,
    Json(request): Json<ReassignAvatarReview>,
) -> AppResult<impl IntoResponse> {
    require_admin(&auth)?;

    let old_assignment = ensure_assignment_exists(&state.pool, assignment_id).await?;

    // Mark old assignment as reassigned.
    AvatarReviewRepo::mark_reassigned(&state.pool, assignment_id).await?;

    // Create new assignment pointing back to the old one.
    let new_assignment = AvatarReviewRepo::create_assignment_with_reassign(
        &state.pool,
        old_assignment.avatar_id,
        request.new_reviewer_user_id,
        auth.user_id,
        old_assignment.review_round,
        old_assignment.deadline,
        Some(assignment_id),
    )
    .await?;

    // Update avatar status back to assigned (2).
    AvatarReviewRepo::update_review_status(&state.pool, old_assignment.avatar_id, 2).await?;

    // Log audit entry.
    AvatarReviewRepo::log_action(
        &state.pool,
        old_assignment.avatar_id,
        "reassigned",
        auth.user_id,
        Some(request.new_reviewer_user_id),
        None,
        &serde_json::json!({
            "project_id": project_id,
            "old_assignment_id": assignment_id,
            "new_assignment_id": new_assignment.id,
            "old_reviewer_user_id": old_assignment.reviewer_user_id,
        }),
    )
    .await?;

    tracing::info!(
        user_id = auth.user_id,
        old_assignment_id = assignment_id,
        new_assignment_id = new_assignment.id,
        new_reviewer = request.new_reviewer_user_id,
        "Avatar review reassigned"
    );

    Ok(Json(DataResponse {
        data: new_assignment,
    }))
}

/// GET /projects/{project_id}/review/workload
///
/// Get reviewer workload summary for a project. Admin only.
pub async fn get_workload(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(project_id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    require_admin(&auth)?;

    let workload = AvatarReviewRepo::reviewer_workload_summary(&state.pool, project_id).await?;

    Ok(Json(DataResponse { data: workload }))
}

/// Query parameters for the reviewer queue endpoint.
#[derive(Debug, Deserialize)]
pub struct MyQueueParams {
    /// Filter to assignments for avatars in projects belonging to this pipeline.
    pub pipeline_id: Option<DbId>,
    #[serde(flatten)]
    pub pagination: PaginationParams,
}

/// GET /review/avatar-assignments/my-queue
///
/// Get the authenticated user's review queue. Paginated.
/// Optionally filtered by pipeline_id.
pub async fn my_queue(
    auth: AuthUser,
    State(state): State<AppState>,
    Query(params): Query<MyQueueParams>,
) -> AppResult<impl IntoResponse> {
    let limit = clamp_limit(params.pagination.limit, DEFAULT_SEARCH_LIMIT, MAX_SEARCH_LIMIT);
    let offset = clamp_offset(params.pagination.offset);

    let queue = AvatarReviewRepo::list_by_reviewer(
        &state.pool,
        auth.user_id,
        params.pipeline_id,
        limit,
        offset,
    )
    .await?;

    Ok(Json(DataResponse { data: queue }))
}

/// POST /review/avatar-assignments/assignments/{assignment_id}/start
///
/// Start reviewing an assignment. Must be the assigned reviewer or admin.
pub async fn start_review(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(assignment_id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let assignment = ensure_assignment_exists(&state.pool, assignment_id).await?;

    // Must be the assigned reviewer or admin.
    if assignment.reviewer_user_id != auth.user_id && auth.role != ROLE_ADMIN {
        return Err(AppError::Core(CoreError::Forbidden(
            "Only the assigned reviewer or an admin can start this review".to_string(),
        )));
    }

    // Set started_at on the assignment.
    let updated = AvatarReviewRepo::start_review(&state.pool, assignment_id)
        .await?
        .ok_or_else(|| {
            AppError::Core(CoreError::NotFound {
                entity: "AvatarReviewAssignment",
                id: assignment_id,
            })
        })?;

    // Update avatar status to in_review (3).
    AvatarReviewRepo::update_review_status(&state.pool, assignment.avatar_id, 3).await?;

    // Log audit entry.
    AvatarReviewRepo::log_action(
        &state.pool,
        assignment.avatar_id,
        "review_started",
        auth.user_id,
        None,
        None,
        &serde_json::json!({
            "assignment_id": assignment_id,
        }),
    )
    .await?;

    tracing::info!(
        user_id = auth.user_id,
        assignment_id = assignment_id,
        avatar_id = assignment.avatar_id,
        "Review started"
    );

    Ok(Json(DataResponse { data: updated }))
}

/// POST /review/avatar-assignments/assignments/{assignment_id}/decide
///
/// Submit a review decision (approve or reject). Must be assigned reviewer or admin.
pub async fn submit_decision(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(assignment_id): Path<DbId>,
    Json(request): Json<ReviewDecisionRequest>,
) -> AppResult<impl IntoResponse> {
    let assignment = ensure_assignment_exists(&state.pool, assignment_id).await?;

    // Must be the assigned reviewer or admin.
    if assignment.reviewer_user_id != auth.user_id && auth.role != ROLE_ADMIN {
        return Err(AppError::Core(CoreError::Forbidden(
            "Only the assigned reviewer or an admin can decide this review".to_string(),
        )));
    }

    // Validate decision value.
    if request.decision != "approved" && request.decision != "rejected" {
        return Err(AppError::BadRequest(
            "Decision must be 'approved' or 'rejected'".to_string(),
        ));
    }

    // Rejected decisions require a comment.
    if request.decision == "rejected" && request.comment.as_deref().unwrap_or("").is_empty() {
        return Err(AppError::BadRequest(
            "A comment is required when rejecting".to_string(),
        ));
    }

    // Assignment must be active and started.
    if assignment.status != "active" {
        return Err(AppError::BadRequest(
            "Assignment must be active to submit a decision".to_string(),
        ));
    }
    let started_at = assignment.started_at.ok_or_else(|| {
        AppError::BadRequest("Review must be started before submitting a decision".to_string())
    })?;

    // Calculate review duration.
    let duration_sec = (chrono::Utc::now() - started_at).num_seconds() as i32;

    // Create decision record.
    let decision = AvatarReviewRepo::create_decision(
        &state.pool,
        assignment_id,
        assignment.avatar_id,
        auth.user_id,
        &request.decision,
        request.comment.as_deref(),
        assignment.review_round,
        Some(duration_sec),
    )
    .await?;

    // Complete the assignment.
    AvatarReviewRepo::complete_assignment(&state.pool, assignment_id, "completed").await?;

    // Update avatar status: approved → 4, rejected → 5.
    let new_status_id: i16 = if request.decision == "approved" { 4 } else { 5 };
    AvatarReviewRepo::update_review_status(&state.pool, assignment.avatar_id, new_status_id)
        .await?;

    // Log audit entry.
    AvatarReviewRepo::log_action(
        &state.pool,
        assignment.avatar_id,
        &request.decision,
        auth.user_id,
        None,
        request.comment.as_deref(),
        &serde_json::json!({
            "assignment_id": assignment_id,
            "review_round": assignment.review_round,
            "duration_sec": duration_sec,
        }),
    )
    .await?;

    tracing::info!(
        user_id = auth.user_id,
        assignment_id = assignment_id,
        avatar_id = assignment.avatar_id,
        decision = %request.decision,
        duration_sec = duration_sec,
        "Review decision submitted"
    );

    Ok(Json(DataResponse { data: decision }))
}

/// POST /avatars/{avatar_id}/submit-for-rereview
///
/// Submit a avatar that is in rework status for re-review.
pub async fn submit_for_rereview(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(avatar_id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    // Validate avatar is in rework status (6).
    let current_status =
        sqlx::query_scalar::<_, i16>("SELECT review_status_id FROM avatars WHERE id = $1")
            .bind(avatar_id)
            .fetch_optional(&state.pool)
            .await?
            .ok_or_else(|| {
                AppError::Core(CoreError::NotFound {
                    entity: "Avatar",
                    id: avatar_id,
                })
            })?;

    if current_status != 6 {
        return Err(AppError::BadRequest(
            "Avatar must be in 'rework' status to submit for re-review".to_string(),
        ));
    }

    // Find the last completed assignment to determine the previous reviewer.
    let last_assignment =
        AvatarReviewRepo::last_completed_for_avatar(&state.pool, avatar_id)
            .await?
            .ok_or_else(|| {
                AppError::BadRequest(
                    "No previous completed assignment found for this avatar".to_string(),
                )
            })?;

    let new_round = last_assignment.review_round + 1;

    // Create new assignment for the same reviewer.
    let assignment = AvatarReviewRepo::create_assignment(
        &state.pool,
        avatar_id,
        last_assignment.reviewer_user_id,
        auth.user_id,
        new_round,
        None,
    )
    .await?;

    // Update avatar status to assigned (2).
    AvatarReviewRepo::update_review_status(&state.pool, avatar_id, 2).await?;

    // Log audit entries.
    AvatarReviewRepo::log_action(
        &state.pool,
        avatar_id,
        "rework_submitted",
        auth.user_id,
        None,
        None,
        &serde_json::json!({
            "review_round": new_round,
        }),
    )
    .await?;

    AvatarReviewRepo::log_action(
        &state.pool,
        avatar_id,
        "assigned",
        auth.user_id,
        Some(last_assignment.reviewer_user_id),
        Some("re-review after rework"),
        &serde_json::json!({
            "assignment_id": assignment.id,
            "review_round": new_round,
        }),
    )
    .await?;

    tracing::info!(
        user_id = auth.user_id,
        avatar_id = avatar_id,
        reviewer_user_id = last_assignment.reviewer_user_id,
        review_round = new_round,
        "Avatar submitted for re-review"
    );

    Ok((StatusCode::CREATED, Json(DataResponse { data: assignment })))
}

/// GET /avatars/{avatar_id}/review-history
///
/// Get paginated review audit history for a avatar.
pub async fn get_review_history(
    _auth: AuthUser,
    State(state): State<AppState>,
    Path(avatar_id): Path<DbId>,
    Query(pagination): Query<PaginationParams>,
) -> AppResult<impl IntoResponse> {
    let limit = clamp_limit(pagination.limit, DEFAULT_SEARCH_LIMIT, MAX_SEARCH_LIMIT);
    let offset = clamp_offset(pagination.offset);

    let entries =
        AvatarReviewRepo::list_audit_by_avatar(&state.pool, avatar_id, limit, offset)
            .await?;

    Ok(Json(DataResponse { data: entries }))
}

/// GET /projects/{project_id}/review/audit-log
///
/// Get paginated project review audit log with optional filters. Admin only.
pub async fn get_project_audit_log(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(project_id): Path<DbId>,
    Query(filters): Query<AuditLogFilterParams>,
) -> AppResult<impl IntoResponse> {
    require_admin(&auth)?;

    let limit = clamp_limit(filters.limit, DEFAULT_SEARCH_LIMIT, MAX_SEARCH_LIMIT);
    let offset = clamp_offset(filters.offset);

    let entries = AvatarReviewRepo::list_audit_by_project(
        &state.pool,
        project_id,
        limit,
        offset,
        filters.reviewer_user_id,
        filters.action.as_deref(),
        filters.from_date.as_deref(),
        filters.to_date.as_deref(),
    )
    .await?;

    Ok(Json(DataResponse { data: entries }))
}

/// GET /projects/{project_id}/review/audit-log/export
///
/// Export the project review audit log as CSV. Admin only.
pub async fn export_audit_log(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(project_id): Path<DbId>,
    Query(filters): Query<AuditLogFilterParams>,
) -> AppResult<Response> {
    require_admin(&auth)?;

    let entries = AvatarReviewRepo::export_audit_by_project(
        &state.pool,
        project_id,
        filters.reviewer_user_id,
        filters.action.as_deref(),
        filters.from_date.as_deref(),
        filters.to_date.as_deref(),
    )
    .await?;

    let mut csv =
        String::from("id,avatar_id,action,actor_user_id,target_user_id,comment,created_at\n");
    for entry in &entries {
        csv.push_str(&format!(
            "{},{},{},{},{},{},{}\n",
            entry.id,
            entry.avatar_id,
            entry.action,
            entry.actor_user_id,
            entry
                .target_user_id
                .map_or(String::new(), |id| id.to_string()),
            entry.comment.as_deref().unwrap_or("").replace(',', ";"),
            entry.created_at,
        ));
    }

    Response::builder()
        .header("Content-Type", "text/csv")
        .header(
            "Content-Disposition",
            "attachment; filename=\"review-audit-log.csv\"",
        )
        .body(Body::from(csv))
        .map_err(|e| AppError::InternalError(format!("Failed to build CSV response: {e}")))
}
