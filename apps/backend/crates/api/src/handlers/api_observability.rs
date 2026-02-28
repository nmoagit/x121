//! Handlers for the API Usage & Observability Dashboard (PRD-106).
//!
//! All endpoints are admin-only and provide read access to API metrics,
//! alert configuration management, and rate limit utilization data.

use axum::extract::{Path, Query, State};
use axum::response::IntoResponse;
use axum::Json;
use chrono::{Duration, Utc};
use serde::Deserialize;

use x121_core::api_observability::{self, HeatmapCell};
use x121_core::search::{clamp_limit, clamp_offset};
use x121_core::types::DbId;
use x121_db::models::api_observability::{ApiAlertConfig, CreateAlertConfig, MetricsSummary, UpdateAlertConfig};
use x121_db::repositories::api_observability_repo::{CreateAlertInput, UpdateAlertInput};
use x121_db::repositories::{ApiAlertConfigRepo, ApiMetricsRepo, RateLimitUtilRepo};

use crate::error::{AppError, AppResult};
use crate::middleware::rbac::RequireAdmin;
use crate::query::{parse_timestamp, PaginationParams};
use crate::response::DataResponse;
use crate::state::AppState;

// ---------------------------------------------------------------------------
// Query parameter types
// ---------------------------------------------------------------------------

/// Query parameters for the main metrics listing endpoint.
#[derive(Debug, Deserialize)]
pub struct MetricsQueryParams {
    pub endpoint: Option<String>,
    pub api_key_id: Option<i64>,
    pub granularity: Option<String>,
    pub start: Option<String>,
    pub end: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

/// Query parameters for summary endpoints.
#[derive(Debug, Deserialize)]
pub struct PeriodParams {
    pub start: Option<String>,
    pub end: Option<String>,
    pub limit: Option<i64>,
}

/// Query parameters for heatmap data.
#[derive(Debug, Deserialize)]
pub struct HeatmapParams {
    pub granularity: Option<String>,
    pub period: Option<String>,
}

/// Query parameters for top consumers.
#[derive(Debug, Deserialize)]
pub struct TopConsumersParams {
    pub sort: Option<String>,
    pub period: Option<String>,
    pub limit: Option<i64>,
}

/// Query parameters for rate limit history.
#[derive(Debug, Deserialize)]
pub struct RateLimitHistoryParams {
    pub start: Option<String>,
    pub end: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Parse a period string (e.g. "24h", "7d", "30d") into a Duration.
fn parse_period(period: Option<&str>) -> Duration {
    match period {
        Some("1h") => Duration::hours(1),
        Some("6h") => Duration::hours(6),
        Some("7d") => Duration::days(7),
        Some("30d") => Duration::days(30),
        Some("90d") => Duration::days(90),
        _ => Duration::hours(24), // default 24h
    }
}

/// Ensure an alert config exists, returning a proper 404 if not found.
async fn ensure_alert_exists(
    pool: &sqlx::PgPool,
    id: DbId,
) -> AppResult<ApiAlertConfig> {
    ApiAlertConfigRepo::find_by_id(pool, id)
        .await?
        .ok_or_else(|| {
            AppError::Core(x121_core::error::CoreError::NotFound {
                entity: "alert_config",
                id,
            })
        })
}

// ---------------------------------------------------------------------------
// GET /admin/api-metrics
// ---------------------------------------------------------------------------

/// Query API metrics with optional filters.
pub async fn query_metrics(
    RequireAdmin(_admin): RequireAdmin,
    State(state): State<AppState>,
    Query(params): Query<MetricsQueryParams>,
) -> AppResult<impl IntoResponse> {
    if let Some(ref g) = params.granularity {
        api_observability::validate_granularity(g)?;
    }

    let now = Utc::now();
    let start = parse_timestamp(&params.start, now - Duration::hours(24))?;
    let end = parse_timestamp(&params.end, now)?;
    let limit = clamp_limit(params.limit, 100, 1000);
    let offset = clamp_offset(params.offset);

    let metrics = ApiMetricsRepo::query_metrics(
        &state.pool,
        params.endpoint.as_deref(),
        params.api_key_id,
        params.granularity.as_deref(),
        start,
        end,
        limit,
        offset,
    )
    .await?;

    Ok(Json(DataResponse { data: metrics }))
}

// ---------------------------------------------------------------------------
// GET /admin/api-metrics/summary
// ---------------------------------------------------------------------------

/// Get a high-level metrics summary (default: last 24 hours).
pub async fn get_summary(
    RequireAdmin(_admin): RequireAdmin,
    State(state): State<AppState>,
    Query(params): Query<PeriodParams>,
) -> AppResult<impl IntoResponse> {
    let now = Utc::now();
    let start = parse_timestamp(&params.start, now - Duration::hours(24))?;
    let end = parse_timestamp(&params.end, now)?;

    let (total_requests, total_errors, avg_response_time) =
        ApiMetricsRepo::get_summary_counts(&state.pool, start, end).await?;

    let error_rate = if total_requests > 0 {
        (total_errors as f64 / total_requests as f64) * 100.0
    } else {
        0.0
    };

    let ep_limit = clamp_limit(params.limit, 10, 50);
    let top_endpoints =
        ApiMetricsRepo::get_endpoint_breakdown(&state.pool, start, end, ep_limit).await?;

    let summary = MetricsSummary {
        total_requests,
        error_rate,
        avg_response_time,
        top_endpoints,
    };

    Ok(Json(DataResponse { data: summary }))
}

// ---------------------------------------------------------------------------
// GET /admin/api-metrics/endpoints
// ---------------------------------------------------------------------------

/// Get per-endpoint metrics breakdown.
pub async fn get_endpoint_breakdown(
    RequireAdmin(_admin): RequireAdmin,
    State(state): State<AppState>,
    Query(params): Query<PeriodParams>,
) -> AppResult<impl IntoResponse> {
    let now = Utc::now();
    let start = parse_timestamp(&params.start, now - Duration::hours(24))?;
    let end = parse_timestamp(&params.end, now)?;
    let limit = clamp_limit(params.limit, 50, 200);

    let endpoints = ApiMetricsRepo::get_endpoint_breakdown(&state.pool, start, end, limit).await?;

    Ok(Json(DataResponse { data: endpoints }))
}

// ---------------------------------------------------------------------------
// GET /admin/api-metrics/keys
// ---------------------------------------------------------------------------

/// Get per-API-key usage breakdown.
pub async fn get_key_breakdown(
    RequireAdmin(_admin): RequireAdmin,
    State(state): State<AppState>,
    Query(params): Query<TopConsumersParams>,
) -> AppResult<impl IntoResponse> {
    let now = Utc::now();
    let duration = parse_period(params.period.as_deref());
    let start = now - duration;
    let limit = clamp_limit(params.limit, 10, 100);
    let sort_by = params.sort.as_deref().unwrap_or("volume");

    let consumers =
        ApiMetricsRepo::get_top_consumers(&state.pool, start, now, sort_by, limit).await?;

    Ok(Json(DataResponse { data: consumers }))
}

// ---------------------------------------------------------------------------
// GET /admin/api-metrics/heatmap
// ---------------------------------------------------------------------------

/// Get heatmap data (endpoint x time bucket) with normalized intensities.
pub async fn get_heatmap(
    RequireAdmin(_admin): RequireAdmin,
    State(state): State<AppState>,
    Query(params): Query<HeatmapParams>,
) -> AppResult<impl IntoResponse> {
    let granularity = params
        .granularity
        .as_deref()
        .unwrap_or(api_observability::GRANULARITY_1H);
    api_observability::validate_granularity(granularity)?;

    let now = Utc::now();
    let duration = parse_period(params.period.as_deref());
    let start = now - duration;

    let rows = ApiMetricsRepo::get_heatmap_data(&state.pool, granularity, start, now).await?;

    let mut cells: Vec<HeatmapCell> = rows
        .into_iter()
        .map(|r| HeatmapCell {
            endpoint: r.endpoint,
            time_bucket: r.time_bucket.to_rfc3339(),
            request_count: r.request_count,
            intensity: 0.0,
        })
        .collect();

    api_observability::normalize_heatmap(&mut cells);

    Ok(Json(DataResponse { data: cells }))
}

// ---------------------------------------------------------------------------
// GET /admin/api-metrics/top-consumers
// ---------------------------------------------------------------------------

/// Get ranked list of top API consumers.
pub async fn get_top_consumers(
    RequireAdmin(_admin): RequireAdmin,
    State(state): State<AppState>,
    Query(params): Query<TopConsumersParams>,
) -> AppResult<impl IntoResponse> {
    let now = Utc::now();
    let duration = parse_period(params.period.as_deref());
    let start = now - duration;
    let limit = clamp_limit(params.limit, 10, 100);
    let sort_by = params.sort.as_deref().unwrap_or("volume");

    let consumers =
        ApiMetricsRepo::get_top_consumers(&state.pool, start, now, sort_by, limit).await?;

    Ok(Json(DataResponse { data: consumers }))
}

// ---------------------------------------------------------------------------
// GET /admin/api-metrics/rate-limits
// ---------------------------------------------------------------------------

/// Get current rate limit utilization for all API keys.
pub async fn list_rate_limits(
    RequireAdmin(_admin): RequireAdmin,
    State(state): State<AppState>,
    Query(params): Query<PaginationParams>,
) -> AppResult<impl IntoResponse> {
    let limit = clamp_limit(params.limit, 50, 200);
    let offset = clamp_offset(params.offset);

    let utilization = RateLimitUtilRepo::list_current(&state.pool, limit, offset).await?;

    Ok(Json(DataResponse { data: utilization }))
}

// ---------------------------------------------------------------------------
// GET /admin/api-metrics/rate-limits/:key_id/history
// ---------------------------------------------------------------------------

/// Get historical rate limit utilization for a specific API key.
pub async fn get_rate_limit_history(
    RequireAdmin(_admin): RequireAdmin,
    State(state): State<AppState>,
    Path(key_id): Path<i64>,
    Query(params): Query<RateLimitHistoryParams>,
) -> AppResult<impl IntoResponse> {
    let now = Utc::now();
    let start = parse_timestamp(&params.start, now - Duration::hours(24))?;
    let end = parse_timestamp(&params.end, now)?;
    let limit = clamp_limit(params.limit, 100, 1000);
    let offset = clamp_offset(params.offset);

    let history =
        RateLimitUtilRepo::get_history(&state.pool, key_id, start, end, limit, offset).await?;

    Ok(Json(DataResponse { data: history }))
}

// ---------------------------------------------------------------------------
// GET /admin/api-alerts
// ---------------------------------------------------------------------------

/// List all alert configurations.
pub async fn list_alerts(
    RequireAdmin(_admin): RequireAdmin,
    State(state): State<AppState>,
) -> AppResult<impl IntoResponse> {
    let configs = ApiAlertConfigRepo::list_all(&state.pool).await?;
    Ok(Json(DataResponse { data: configs }))
}

// ---------------------------------------------------------------------------
// POST /admin/api-alerts
// ---------------------------------------------------------------------------

/// Create a new alert configuration.
pub async fn create_alert(
    RequireAdmin(admin): RequireAdmin,
    State(state): State<AppState>,
    Json(input): Json<CreateAlertConfig>,
) -> AppResult<impl IntoResponse> {
    api_observability::validate_alert_type(&input.alert_type)?;
    api_observability::validate_comparison(&input.comparison)?;

    let window = input.window_minutes.unwrap_or(5);
    let cooldown = input.cooldown_minutes.unwrap_or(30);
    let enabled = input.enabled.unwrap_or(true);

    if !(1..=1440).contains(&window) {
        return Err(AppError::BadRequest(
            "window_minutes must be between 1 and 1440".to_string(),
        ));
    }
    if !(1..=10080).contains(&cooldown) {
        return Err(AppError::BadRequest(
            "cooldown_minutes must be between 1 and 10080".to_string(),
        ));
    }

    let config = ApiAlertConfigRepo::create(
        &state.pool,
        &CreateAlertInput {
            name: &input.name,
            alert_type: &input.alert_type,
            endpoint_filter: input.endpoint_filter.as_deref(),
            api_key_filter: input.api_key_filter,
            threshold_value: input.threshold_value,
            comparison: &input.comparison,
            window_minutes: window,
            cooldown_minutes: cooldown,
            enabled,
            created_by: Some(admin.user_id),
        },
    )
    .await?;

    tracing::info!(
        alert_id = config.id,
        alert_type = %config.alert_type,
        user_id = admin.user_id,
        "API alert config created",
    );

    Ok(Json(DataResponse { data: config }))
}

// ---------------------------------------------------------------------------
// PUT /admin/api-alerts/:id
// ---------------------------------------------------------------------------

/// Update an existing alert configuration.
pub async fn update_alert(
    RequireAdmin(admin): RequireAdmin,
    State(state): State<AppState>,
    Path(id): Path<i64>,
    Json(input): Json<UpdateAlertConfig>,
) -> AppResult<impl IntoResponse> {
    if let Some(ref at) = input.alert_type {
        api_observability::validate_alert_type(at)?;
    }
    if let Some(ref c) = input.comparison {
        api_observability::validate_comparison(c)?;
    }
    if let Some(w) = input.window_minutes {
        if !(1..=1440).contains(&w) {
            return Err(AppError::BadRequest(
                "window_minutes must be between 1 and 1440".to_string(),
            ));
        }
    }
    if let Some(c) = input.cooldown_minutes {
        if !(1..=10080).contains(&c) {
            return Err(AppError::BadRequest(
                "cooldown_minutes must be between 1 and 10080".to_string(),
            ));
        }
    }

    let config = ApiAlertConfigRepo::update(
        &state.pool,
        id,
        &UpdateAlertInput {
            name: input.name.as_deref(),
            alert_type: input.alert_type.as_deref(),
            endpoint_filter: input.endpoint_filter.as_deref(),
            api_key_filter: input.api_key_filter,
            threshold_value: input.threshold_value,
            comparison: input.comparison.as_deref(),
            window_minutes: input.window_minutes,
            cooldown_minutes: input.cooldown_minutes,
            enabled: input.enabled,
        },
    )
    .await?
    .ok_or_else(|| {
        AppError::Core(x121_core::error::CoreError::NotFound {
            entity: "alert_config",
            id,
        })
    })?;

    tracing::info!(
        alert_id = config.id,
        user_id = admin.user_id,
        "API alert config updated",
    );

    Ok(Json(DataResponse { data: config }))
}

// ---------------------------------------------------------------------------
// DELETE /admin/api-alerts/:id
// ---------------------------------------------------------------------------

/// Delete an alert configuration.
pub async fn delete_alert(
    RequireAdmin(admin): RequireAdmin,
    State(state): State<AppState>,
    Path(id): Path<i64>,
) -> AppResult<impl IntoResponse> {
    // Verify existence first for a proper 404 before deleting.
    ensure_alert_exists(&state.pool, id).await?;
    let deleted = ApiAlertConfigRepo::delete(&state.pool, id)
        .await?
        .expect("alert_config verified to exist");

    tracing::info!(
        alert_id = deleted.id,
        user_id = admin.user_id,
        "API alert config deleted",
    );

    Ok(Json(DataResponse { data: deleted }))
}

// ---------------------------------------------------------------------------
// GET /admin/api-metrics/sample-payloads
// ---------------------------------------------------------------------------

/// A sample payload descriptor.
#[derive(serde::Serialize)]
struct SamplePayloadDescriptor {
    r#type: &'static str,
    description: &'static str,
}

/// All sample payload types available for testing.
const SAMPLE_PAYLOADS: &[SamplePayloadDescriptor] = &[
    SamplePayloadDescriptor {
        r#type: "api_request",
        description: "Single API request metric",
    },
    SamplePayloadDescriptor {
        r#type: "error_spike",
        description: "Simulated error rate spike event",
    },
    SamplePayloadDescriptor {
        r#type: "rate_limit_warning",
        description: "Rate limit approaching threshold",
    },
];

/// List available sample event types for testing observability.
pub async fn list_sample_payloads(
    RequireAdmin(_admin): RequireAdmin,
) -> AppResult<impl IntoResponse> {
    Ok(Json(DataResponse {
        data: SAMPLE_PAYLOADS,
    }))
}
