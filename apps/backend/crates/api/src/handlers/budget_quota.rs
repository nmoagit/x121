//! Handlers for Generation Budget & Quota Management (PRD-93).
//!
//! Admin endpoints for managing project budgets, user quotas, and exemptions.
//! User endpoints for checking budget status before job submission.

use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use chrono::{Duration, Utc};
use serde::Deserialize;

use x121_core::budget_quota::{
    check_budget, compute_trend_projection_with_budget, BudgetCheckResult,
};
use x121_core::error::CoreError;
use x121_core::types::DbId;

use x121_db::models::budget_quota::{
    BudgetStatus, CreateBudgetExemption, CreateProjectBudget, CreateUserQuota, ProjectBudget,
    QuotaStatus, UpdateBudgetExemption, UserQuota,
};
use x121_db::repositories::{
    BudgetExemptionRepo, ConsumptionLedgerRepo, ProjectBudgetRepo, UserQuotaRepo,
};

use crate::error::{AppError, AppResult};
use crate::middleware::auth::AuthUser;
use crate::middleware::rbac::RequireAdmin;
use crate::query::PaginationParams;
use crate::response::DataResponse;
use crate::state::AppState;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Compute the period start timestamp for consumption aggregation
/// based on the period type stored on a budget or quota.
fn compute_period_since(
    period_type: &str,
    period_start: chrono::DateTime<Utc>,
) -> chrono::DateTime<Utc> {
    let now = Utc::now();
    match period_type {
        "daily" => now - Duration::days(1),
        "weekly" => now - Duration::weeks(1),
        "monthly" => now - Duration::days(30),
        // "unlimited" uses the budget's own period_start
        _ => period_start,
    }
}

/// Parse a period query parameter (e.g. "30d", "7d") into number of days.
fn parse_period_days(period: &Option<String>) -> i32 {
    match period.as_deref() {
        Some(s) => {
            let trimmed = s.trim_end_matches('d');
            trimmed.parse::<i32>().unwrap_or(30)
        }
        None => 30,
    }
}

/// Compute percentage consumed, returning 0.0 if total is zero.
fn consumed_pct(consumed: f64, total: f64) -> f64 {
    if total > 0.0 {
        (consumed / total) * 100.0
    } else {
        0.0
    }
}

/// Build a full BudgetStatus for a project, including trend projection.
async fn build_budget_status(
    state: &AppState,
    budget: ProjectBudget,
) -> AppResult<BudgetStatus> {
    let since = compute_period_since(&budget.period_type, budget.period_start);
    let consumed =
        ConsumptionLedgerRepo::sum_for_project_period(&state.pool, budget.project_id, since)
            .await?;
    let remaining = (budget.budget_gpu_hours - consumed).max(0.0);
    let pct = consumed_pct(consumed, budget.budget_gpu_hours);

    let daily_data =
        ConsumptionLedgerRepo::daily_aggregates(&state.pool, budget.project_id, 30).await?;
    let daily_values: Vec<f64> = daily_data.iter().map(|d| d.total_gpu_hours).collect();
    let trend = compute_trend_projection_with_budget(&daily_values, remaining);

    Ok(BudgetStatus {
        budget,
        consumed_gpu_hours: consumed,
        remaining_gpu_hours: remaining,
        consumed_pct: pct,
        trend,
    })
}

/// Build a QuotaStatus for a user.
async fn build_quota_status(state: &AppState, quota: UserQuota) -> AppResult<QuotaStatus> {
    let since = compute_period_since(&quota.period_type, quota.period_start);
    let consumed =
        ConsumptionLedgerRepo::sum_for_user_period(&state.pool, quota.user_id, since).await?;
    let remaining = (quota.quota_gpu_hours - consumed).max(0.0);
    let pct = consumed_pct(consumed, quota.quota_gpu_hours);

    Ok(QuotaStatus {
        quota,
        consumed_gpu_hours: consumed,
        remaining_gpu_hours: remaining,
        consumed_pct: pct,
    })
}

/// Find a project budget or return 404.
async fn ensure_budget_exists(state: &AppState, project_id: DbId) -> AppResult<ProjectBudget> {
    ProjectBudgetRepo::find_by_project_id(&state.pool, project_id)
        .await?
        .ok_or_else(|| {
            AppError::Core(CoreError::NotFound {
                entity: "ProjectBudget",
                id: project_id,
            })
        })
}

/// Find a user quota or return 404.
async fn ensure_quota_exists(state: &AppState, user_id: DbId) -> AppResult<UserQuota> {
    UserQuotaRepo::find_by_user_id(&state.pool, user_id)
        .await?
        .ok_or_else(|| {
            AppError::Core(CoreError::NotFound {
                entity: "UserQuota",
                id: user_id,
            })
        })
}

/// Find an exemption by ID or return 404.
async fn ensure_exemption_exists(
    state: &AppState,
    id: DbId,
) -> AppResult<x121_db::models::budget_quota::BudgetExemption> {
    BudgetExemptionRepo::find_by_id(&state.pool, id)
        .await?
        .ok_or_else(|| {
            AppError::Core(CoreError::NotFound {
                entity: "BudgetExemption",
                id,
            })
        })
}

// ---------------------------------------------------------------------------
// Query parameters
// ---------------------------------------------------------------------------

/// Query params for history endpoints.
#[derive(Debug, Deserialize)]
pub struct HistoryParams {
    pub period: Option<String>,
}

/// Query params for the pre-submission budget check.
#[derive(Debug, Deserialize)]
pub struct BudgetCheckParams {
    pub project_id: DbId,
    pub estimated_hours: f64,
}

// ===========================================================================
// Admin: Project Budgets
// ===========================================================================

/// `GET /admin/budgets` -- list all project budgets.
pub async fn admin_list_budgets(
    State(state): State<AppState>,
    RequireAdmin(_admin): RequireAdmin,
    Query(params): Query<PaginationParams>,
) -> AppResult<impl IntoResponse> {
    let budgets = ProjectBudgetRepo::list_all(&state.pool, params.limit, params.offset).await?;
    Ok(Json(DataResponse { data: budgets }))
}

/// `GET /admin/budgets/:project_id` -- get budget with trend projection.
pub async fn admin_get_budget(
    State(state): State<AppState>,
    RequireAdmin(_admin): RequireAdmin,
    Path(project_id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let budget = ensure_budget_exists(&state, project_id).await?;
    let status = build_budget_status(&state, budget).await?;
    Ok(Json(DataResponse { data: status }))
}

/// `PUT /admin/budgets/:project_id` -- upsert project budget.
pub async fn admin_upsert_budget(
    State(state): State<AppState>,
    RequireAdmin(admin): RequireAdmin,
    Path(project_id): Path<DbId>,
    Json(body): Json<CreateProjectBudget>,
) -> AppResult<impl IntoResponse> {
    let budget = ProjectBudgetRepo::upsert(&state.pool, project_id, &body, admin.user_id).await?;

    tracing::info!(
        project_id,
        user_id = admin.user_id,
        budget_gpu_hours = budget.budget_gpu_hours,
        "Project budget upserted"
    );

    Ok(Json(DataResponse { data: budget }))
}

/// `DELETE /admin/budgets/:project_id` -- remove project budget.
pub async fn admin_delete_budget(
    State(state): State<AppState>,
    RequireAdmin(admin): RequireAdmin,
    Path(project_id): Path<DbId>,
) -> AppResult<StatusCode> {
    let deleted = ProjectBudgetRepo::delete(&state.pool, project_id).await?;
    if deleted {
        tracing::info!(
            project_id,
            user_id = admin.user_id,
            "Project budget deleted"
        );
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(AppError::Core(CoreError::NotFound {
            entity: "ProjectBudget",
            id: project_id,
        }))
    }
}

/// `GET /admin/budgets/:project_id/history` -- daily consumption aggregates.
pub async fn admin_budget_history(
    State(state): State<AppState>,
    RequireAdmin(_admin): RequireAdmin,
    Path(project_id): Path<DbId>,
    Query(params): Query<HistoryParams>,
) -> AppResult<impl IntoResponse> {
    let days = parse_period_days(&params.period);
    let history = ConsumptionLedgerRepo::daily_aggregates(&state.pool, project_id, days).await?;
    Ok(Json(DataResponse { data: history }))
}

// ===========================================================================
// Admin: User Quotas
// ===========================================================================

/// `GET /admin/quotas` -- list all user quotas.
pub async fn admin_list_quotas(
    State(state): State<AppState>,
    RequireAdmin(_admin): RequireAdmin,
    Query(params): Query<PaginationParams>,
) -> AppResult<impl IntoResponse> {
    let quotas = UserQuotaRepo::list_all(&state.pool, params.limit, params.offset).await?;
    Ok(Json(DataResponse { data: quotas }))
}

/// `GET /admin/quotas/:user_id` -- get quota for user.
pub async fn admin_get_quota(
    State(state): State<AppState>,
    RequireAdmin(_admin): RequireAdmin,
    Path(user_id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let quota = ensure_quota_exists(&state, user_id).await?;
    let status = build_quota_status(&state, quota).await?;
    Ok(Json(DataResponse { data: status }))
}

/// `PUT /admin/quotas/:user_id` -- upsert user quota.
pub async fn admin_upsert_quota(
    State(state): State<AppState>,
    RequireAdmin(admin): RequireAdmin,
    Path(user_id): Path<DbId>,
    Json(body): Json<CreateUserQuota>,
) -> AppResult<impl IntoResponse> {
    let quota = UserQuotaRepo::upsert(&state.pool, user_id, &body, admin.user_id).await?;

    tracing::info!(
        user_id,
        admin_id = admin.user_id,
        quota_gpu_hours = quota.quota_gpu_hours,
        "User quota upserted"
    );

    Ok(Json(DataResponse { data: quota }))
}

/// `DELETE /admin/quotas/:user_id` -- remove user quota.
pub async fn admin_delete_quota(
    State(state): State<AppState>,
    RequireAdmin(admin): RequireAdmin,
    Path(user_id): Path<DbId>,
) -> AppResult<StatusCode> {
    let deleted = UserQuotaRepo::delete(&state.pool, user_id).await?;
    if deleted {
        tracing::info!(user_id, admin_id = admin.user_id, "User quota deleted");
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(AppError::Core(CoreError::NotFound {
            entity: "UserQuota",
            id: user_id,
        }))
    }
}

/// `GET /admin/quotas/:user_id/history` -- daily user consumption.
pub async fn admin_quota_history(
    State(state): State<AppState>,
    RequireAdmin(_admin): RequireAdmin,
    Path(user_id): Path<DbId>,
    Query(params): Query<HistoryParams>,
) -> AppResult<impl IntoResponse> {
    let days = parse_period_days(&params.period);
    let history =
        ConsumptionLedgerRepo::daily_aggregates_by_user(&state.pool, user_id, days).await?;
    Ok(Json(DataResponse { data: history }))
}

// ===========================================================================
// Admin: Budget Exemptions
// ===========================================================================

/// `GET /admin/budget-exemptions` -- list exemptions.
pub async fn admin_list_exemptions(
    State(state): State<AppState>,
    RequireAdmin(_admin): RequireAdmin,
    Query(params): Query<PaginationParams>,
) -> AppResult<impl IntoResponse> {
    let exemptions =
        BudgetExemptionRepo::list_all(&state.pool, params.limit, params.offset).await?;
    Ok(Json(DataResponse { data: exemptions }))
}

/// `POST /admin/budget-exemptions` -- create exemption.
pub async fn admin_create_exemption(
    State(state): State<AppState>,
    RequireAdmin(admin): RequireAdmin,
    Json(body): Json<CreateBudgetExemption>,
) -> AppResult<impl IntoResponse> {
    let exemption = BudgetExemptionRepo::create(&state.pool, &body, admin.user_id).await?;

    tracing::info!(
        exemption_id = exemption.id,
        name = %exemption.name,
        user_id = admin.user_id,
        "Budget exemption created"
    );

    Ok((StatusCode::CREATED, Json(DataResponse { data: exemption })))
}

/// `PUT /admin/budget-exemptions/:id` -- update exemption.
pub async fn admin_update_exemption(
    State(state): State<AppState>,
    RequireAdmin(admin): RequireAdmin,
    Path(id): Path<DbId>,
    Json(body): Json<UpdateBudgetExemption>,
) -> AppResult<impl IntoResponse> {
    // Verify existence before update to get a proper 404.
    ensure_exemption_exists(&state, id).await?;

    let exemption = BudgetExemptionRepo::update(&state.pool, id, &body)
        .await?
        .ok_or_else(|| {
            AppError::Core(CoreError::NotFound {
                entity: "BudgetExemption",
                id,
            })
        })?;

    tracing::info!(
        exemption_id = id,
        user_id = admin.user_id,
        "Budget exemption updated"
    );

    Ok(Json(DataResponse { data: exemption }))
}

/// `DELETE /admin/budget-exemptions/:id` -- delete exemption.
pub async fn admin_delete_exemption(
    State(state): State<AppState>,
    RequireAdmin(admin): RequireAdmin,
    Path(id): Path<DbId>,
) -> AppResult<StatusCode> {
    let deleted = BudgetExemptionRepo::delete(&state.pool, id).await?;
    if deleted {
        tracing::info!(
            exemption_id = id,
            user_id = admin.user_id,
            "Budget exemption deleted"
        );
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(AppError::Core(CoreError::NotFound {
            entity: "BudgetExemption",
            id,
        }))
    }
}

// ===========================================================================
// User: Budget Status
// ===========================================================================

/// `GET /budgets/my-project/:project_id` -- budget status for user's project.
///
/// Returns `BudgetStatus` if a budget exists, or a 204 NO_CONTENT if none configured.
pub async fn user_project_budget(
    State(state): State<AppState>,
    _auth: AuthUser,
    Path(project_id): Path<DbId>,
) -> AppResult<axum::response::Response> {
    let budget = match ProjectBudgetRepo::find_by_project_id(&state.pool, project_id).await? {
        Some(b) => b,
        None => return Ok(StatusCode::NO_CONTENT.into_response()),
    };

    let status = build_budget_status(&state, budget).await?;
    Ok(Json(DataResponse { data: status }).into_response())
}

/// `GET /budgets/my-quota` -- current user's quota status.
///
/// Returns `QuotaStatus` if a quota exists, or a 204 NO_CONTENT if none assigned.
pub async fn user_my_quota(
    State(state): State<AppState>,
    auth: AuthUser,
) -> AppResult<axum::response::Response> {
    let quota = match UserQuotaRepo::find_by_user_id(&state.pool, auth.user_id).await? {
        Some(q) => q,
        None => return Ok(StatusCode::NO_CONTENT.into_response()),
    };

    let status = build_quota_status(&state, quota).await?;
    Ok(Json(DataResponse { data: status }).into_response())
}

/// `GET /budgets/check` -- pre-submission budget check.
pub async fn user_budget_check(
    State(state): State<AppState>,
    _auth: AuthUser,
    Query(params): Query<BudgetCheckParams>,
) -> AppResult<impl IntoResponse> {
    let budget = match ProjectBudgetRepo::find_by_project_id(&state.pool, params.project_id).await?
    {
        Some(b) => b,
        None => {
            return Ok(Json(DataResponse {
                data: BudgetCheckResult::NoBudget,
            }));
        }
    };

    let since = compute_period_since(&budget.period_type, budget.period_start);
    let consumed =
        ConsumptionLedgerRepo::sum_for_project_period(&state.pool, params.project_id, since)
            .await?;

    let result = check_budget(
        budget.budget_gpu_hours,
        consumed,
        params.estimated_hours,
        budget.warning_threshold_pct,
        budget.critical_threshold_pct,
        budget.hard_limit_enabled,
    );

    Ok(Json(DataResponse { data: result }))
}
