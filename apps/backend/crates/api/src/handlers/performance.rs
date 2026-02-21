//! Handlers for performance & benchmarking dashboard endpoints (PRD-41).
//!
//! All endpoints require admin role.

use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use chrono::{Duration, Utc};
use serde::Deserialize;
use trulience_core::error::CoreError;
use trulience_core::types::DbId;
use trulience_db::models::performance_metric::{
    CreateAlertThreshold, CreatePerformanceMetric, PerformanceOverview, UpdateAlertThreshold,
    WorkflowComparison,
};
use trulience_db::repositories::{PerformanceAlertRepo, PerformanceMetricRepo};

use crate::error::{AppError, AppResult};
use crate::middleware::rbac::RequireAdmin;
use crate::response::DataResponse;
use crate::state::AppState;

// ---------------------------------------------------------------------------
// Request / query parameter types
// ---------------------------------------------------------------------------

/// Common date range query parameters.
#[derive(Debug, Deserialize)]
pub struct DateRangeQuery {
    /// ISO 8601 start date. Defaults to 30 days ago.
    pub from: Option<String>,
    /// ISO 8601 end date. Defaults to now.
    pub to: Option<String>,
}

/// Query parameters for the trend endpoint.
#[derive(Debug, Deserialize)]
pub struct TrendQuery {
    pub from: Option<String>,
    pub to: Option<String>,
    /// Grouping granularity: `day`, `week`, or `month`. Defaults to `day`.
    pub granularity: Option<String>,
}

/// Query parameters for workflow comparison.
#[derive(Debug, Deserialize)]
pub struct ComparisonQuery {
    /// Comma-separated workflow IDs.
    pub workflows: String,
    pub from: Option<String>,
    pub to: Option<String>,
}

/// Query parameters for worker comparison.
#[derive(Debug, Deserialize)]
pub struct WorkerComparisonQuery {
    pub from: Option<String>,
    pub to: Option<String>,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Parse an optional ISO 8601 string into a Timestamp, with a fallback.
fn parse_from(
    s: &Option<String>,
    default_days_ago: i64,
) -> AppResult<chrono::DateTime<chrono::Utc>> {
    match s {
        Some(v) => v
            .parse::<chrono::DateTime<chrono::Utc>>()
            .map_err(|_| AppError::BadRequest("Invalid 'from' date format".into())),
        None => Ok(Utc::now() - Duration::days(default_days_ago)),
    }
}

fn parse_to(s: &Option<String>) -> AppResult<chrono::DateTime<chrono::Utc>> {
    match s {
        Some(v) => v
            .parse::<chrono::DateTime<chrono::Utc>>()
            .map_err(|_| AppError::BadRequest("Invalid 'to' date format".into())),
        None => Ok(Utc::now()),
    }
}

fn validate_granularity(g: &str) -> AppResult<()> {
    if !["day", "week", "month"].contains(&g) {
        return Err(AppError::BadRequest(
            "granularity must be one of: day, week, month".into(),
        ));
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

/// GET /performance/overview
///
/// Aggregated metrics across all workflows for the given time range.
pub async fn get_overview(
    State(state): State<AppState>,
    RequireAdmin(_admin): RequireAdmin,
    Query(params): Query<DateRangeQuery>,
) -> AppResult<impl IntoResponse> {
    let from = parse_from(&params.from, 30)?;
    let to = parse_to(&params.to)?;

    let agg = PerformanceMetricRepo::overview_aggregates(&state.pool, from, to).await?;
    let top = PerformanceMetricRepo::aggregate_by_workflow(&state.pool, from, to, 5, true).await?;
    let bottom =
        PerformanceMetricRepo::aggregate_by_workflow(&state.pool, from, to, 5, false).await?;

    let total_gpu_hours = agg.total_gpu_time_ms as f64 / 3_600_000.0;

    let overview = PerformanceOverview {
        total_gpu_hours,
        avg_time_per_frame_ms: agg.avg_time_per_frame_ms,
        peak_vram_mb: agg.peak_vram_mb,
        total_jobs: agg.total_jobs,
        total_frames: agg.total_frames,
        top_workflows: top,
        bottom_workflows: bottom,
    };

    Ok(Json(DataResponse { data: overview }))
}

// ---------------------------------------------------------------------------
// Per-workflow
// ---------------------------------------------------------------------------

/// GET /performance/workflow/{id}
///
/// Detailed performance metrics for a single workflow.
pub async fn get_workflow_performance(
    State(state): State<AppState>,
    RequireAdmin(_admin): RequireAdmin,
    Path(workflow_id): Path<DbId>,
    Query(params): Query<DateRangeQuery>,
) -> AppResult<impl IntoResponse> {
    let from = parse_from(&params.from, 30)?;
    let to = parse_to(&params.to)?;

    let metrics =
        PerformanceMetricRepo::query_by_workflow(&state.pool, workflow_id, from, to).await?;
    Ok(Json(DataResponse { data: metrics }))
}

/// GET /performance/workflow/{id}/trend
///
/// Time-series trend data for a single workflow.
pub async fn get_workflow_trend(
    State(state): State<AppState>,
    RequireAdmin(_admin): RequireAdmin,
    Path(workflow_id): Path<DbId>,
    Query(params): Query<TrendQuery>,
) -> AppResult<impl IntoResponse> {
    let from = parse_from(&params.from, 30)?;
    let to = parse_to(&params.to)?;
    let granularity = params.granularity.as_deref().unwrap_or("day");
    validate_granularity(granularity)?;

    let trend =
        PerformanceMetricRepo::trend(&state.pool, from, to, granularity, Some(workflow_id)).await?;
    Ok(Json(DataResponse { data: trend }))
}

// ---------------------------------------------------------------------------
// Per-worker
// ---------------------------------------------------------------------------

/// GET /performance/worker/{id}
///
/// Performance metrics for a single worker.
pub async fn get_worker_performance(
    State(state): State<AppState>,
    RequireAdmin(_admin): RequireAdmin,
    Path(worker_id): Path<DbId>,
    Query(params): Query<DateRangeQuery>,
) -> AppResult<impl IntoResponse> {
    let from = parse_from(&params.from, 30)?;
    let to = parse_to(&params.to)?;

    let summary =
        PerformanceMetricRepo::aggregate_single_worker(&state.pool, worker_id, from, to).await?;

    match summary {
        Some(s) => Ok(Json(DataResponse { data: s })),
        None => Err(AppError::Core(CoreError::NotFound {
            entity: "Worker metrics",
            id: worker_id,
        })),
    }
}

/// GET /performance/workers/comparison
///
/// Compare all workers' performance.
pub async fn compare_workers(
    State(state): State<AppState>,
    RequireAdmin(_admin): RequireAdmin,
    Query(params): Query<WorkerComparisonQuery>,
) -> AppResult<impl IntoResponse> {
    let from = parse_from(&params.from, 30)?;
    let to = parse_to(&params.to)?;

    let summaries = PerformanceMetricRepo::aggregate_by_worker(&state.pool, from, to).await?;
    Ok(Json(DataResponse { data: summaries }))
}

// ---------------------------------------------------------------------------
// Workflow comparison
// ---------------------------------------------------------------------------

/// GET /performance/comparison?workflows=id1,id2&from=X&to=Y
///
/// Compare two or more workflows side-by-side.
pub async fn compare_workflows(
    State(state): State<AppState>,
    RequireAdmin(_admin): RequireAdmin,
    Query(params): Query<ComparisonQuery>,
) -> AppResult<impl IntoResponse> {
    let from = parse_from(&params.from, 30)?;
    let to = parse_to(&params.to)?;

    let workflow_ids: Vec<DbId> = params
        .workflows
        .split(',')
        .filter_map(|s| s.trim().parse::<DbId>().ok())
        .collect();

    if workflow_ids.len() < 2 {
        return Err(AppError::BadRequest(
            "At least 2 workflow IDs are required for comparison".into(),
        ));
    }

    let summaries =
        PerformanceMetricRepo::aggregate_for_workflows(&state.pool, &workflow_ids, from, to)
            .await?;

    let comparison = WorkflowComparison { summaries };
    Ok(Json(DataResponse { data: comparison }))
}

// ---------------------------------------------------------------------------
// Trend (global)
// ---------------------------------------------------------------------------

/// GET /performance/trend
///
/// Global time-series trend data across all workflows.
pub async fn get_global_trend(
    State(state): State<AppState>,
    RequireAdmin(_admin): RequireAdmin,
    Query(params): Query<TrendQuery>,
) -> AppResult<impl IntoResponse> {
    let from = parse_from(&params.from, 30)?;
    let to = parse_to(&params.to)?;
    let granularity = params.granularity.as_deref().unwrap_or("day");
    validate_granularity(granularity)?;

    let trend = PerformanceMetricRepo::trend(&state.pool, from, to, granularity, None).await?;
    Ok(Json(DataResponse { data: trend }))
}

// ---------------------------------------------------------------------------
// Metric recording (internal / event-driven)
// ---------------------------------------------------------------------------

/// POST /performance/metrics
///
/// Record a performance metric for a completed job.
/// Typically called by internal services, not directly by browser clients.
pub async fn record_metric(
    State(state): State<AppState>,
    RequireAdmin(_admin): RequireAdmin,
    Json(input): Json<CreatePerformanceMetric>,
) -> AppResult<impl IntoResponse> {
    let metric = PerformanceMetricRepo::insert(&state.pool, &input).await?;
    Ok((StatusCode::CREATED, Json(DataResponse { data: metric })))
}

// ---------------------------------------------------------------------------
// Alert thresholds CRUD
// ---------------------------------------------------------------------------

/// GET /performance/alerts/thresholds
///
/// List all performance alert thresholds.
pub async fn list_alert_thresholds(
    State(state): State<AppState>,
    RequireAdmin(_admin): RequireAdmin,
) -> AppResult<impl IntoResponse> {
    let thresholds = PerformanceAlertRepo::list_all(&state.pool).await?;
    Ok(Json(DataResponse { data: thresholds }))
}

/// POST /performance/alerts/thresholds
///
/// Create a new alert threshold.
pub async fn create_alert_threshold(
    State(state): State<AppState>,
    RequireAdmin(admin): RequireAdmin,
    Json(input): Json<CreateAlertThreshold>,
) -> AppResult<impl IntoResponse> {
    validate_alert_threshold_create(&input)?;

    let threshold = PerformanceAlertRepo::create(&state.pool, &input).await?;

    tracing::info!(
        threshold_id = threshold.id,
        metric = %threshold.metric_name,
        scope = %threshold.scope_type,
        user_id = admin.user_id,
        "Performance alert threshold created",
    );

    Ok((StatusCode::CREATED, Json(DataResponse { data: threshold })))
}

/// PUT /performance/alerts/thresholds/{id}
///
/// Update an existing alert threshold.
pub async fn update_alert_threshold(
    State(state): State<AppState>,
    RequireAdmin(admin): RequireAdmin,
    Path(threshold_id): Path<DbId>,
    Json(input): Json<UpdateAlertThreshold>,
) -> AppResult<impl IntoResponse> {
    // Validate thresholds if both are provided.
    if let (Some(w), Some(c)) = (input.warning_threshold, input.critical_threshold) {
        if w >= c {
            return Err(AppError::Core(CoreError::Validation(
                "warning_threshold must be less than critical_threshold".into(),
            )));
        }
    }

    let threshold = PerformanceAlertRepo::update(&state.pool, threshold_id, &input)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "PerformanceAlertThreshold",
            id: threshold_id,
        }))?;

    tracing::info!(
        threshold_id,
        user_id = admin.user_id,
        "Performance alert threshold updated",
    );

    Ok(Json(DataResponse { data: threshold }))
}

/// DELETE /performance/alerts/thresholds/{id}
///
/// Delete an alert threshold.
pub async fn delete_alert_threshold(
    State(state): State<AppState>,
    RequireAdmin(admin): RequireAdmin,
    Path(threshold_id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let deleted = PerformanceAlertRepo::delete(&state.pool, threshold_id).await?;
    if !deleted {
        return Err(AppError::Core(CoreError::NotFound {
            entity: "PerformanceAlertThreshold",
            id: threshold_id,
        }));
    }

    tracing::info!(
        threshold_id,
        user_id = admin.user_id,
        "Performance alert threshold deleted",
    );

    Ok(StatusCode::NO_CONTENT)
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

fn validate_alert_threshold_create(input: &CreateAlertThreshold) -> AppResult<()> {
    if input.metric_name.is_empty() {
        return Err(AppError::Core(CoreError::Validation(
            "metric_name is required".into(),
        )));
    }

    if !["global", "workflow", "worker"].contains(&input.scope_type.as_str()) {
        return Err(AppError::Core(CoreError::Validation(
            "scope_type must be one of: global, workflow, worker".into(),
        )));
    }

    if input.scope_type != "global" && input.scope_id.is_none() {
        return Err(AppError::Core(CoreError::Validation(
            "scope_id is required for non-global scopes".into(),
        )));
    }

    if input.warning_threshold >= input.critical_threshold {
        return Err(AppError::Core(CoreError::Validation(
            "warning_threshold must be less than critical_threshold".into(),
        )));
    }

    if input.warning_threshold < 0.0 || input.critical_threshold < 0.0 {
        return Err(AppError::Core(CoreError::Validation(
            "Threshold values must be non-negative".into(),
        )));
    }

    Ok(())
}
