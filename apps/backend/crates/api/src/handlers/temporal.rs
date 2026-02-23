//! Handlers for temporal continuity endpoints (PRD-26).
//!
//! Provides endpoints for retrieving and managing temporal drift,
//! centering, and grain metrics across chained generation segments.

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use serde::Serialize;
use trulience_core::error::CoreError;
use trulience_core::temporal_continuity::{
    classify_drift, classify_grain_match, compute_trend_direction, validate_centering_threshold,
    validate_drift_threshold, validate_grain_threshold, DriftSeverity, GrainQuality,
    TrendDirection, DEFAULT_DRIFT_THRESHOLD, DEFAULT_GRAIN_THRESHOLD,
};
use trulience_core::types::DbId;
use trulience_db::models::temporal_metric::{
    CreateTemporalMetric, CreateTemporalSetting, TemporalMetric,
};
use trulience_db::repositories::{TemporalMetricRepo, TemporalSettingRepo};

use crate::error::{AppError, AppResult};
use crate::middleware::auth::AuthUser;
use crate::response::DataResponse;
use crate::state::AppState;

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

/// Enriched temporal metric with severity classification.
#[derive(Debug, Serialize)]
pub struct EnrichedTemporalMetric {
    #[serde(flatten)]
    pub metric: TemporalMetric,
    pub drift_severity: Option<DriftSeverity>,
    pub grain_quality: Option<GrainQuality>,
}

/// Scene-level temporal summary with trend data.
#[derive(Debug, Serialize)]
pub struct SceneTemporalSummary {
    pub metrics: Vec<EnrichedTemporalMetric>,
    pub drift_trend: TrendDirection,
}

// ---------------------------------------------------------------------------
// Scene-level metrics
// ---------------------------------------------------------------------------

/// GET /scenes/{id}/temporal-metrics
///
/// Returns all temporal metrics for segments in a scene, enriched with
/// drift severity classifications and overall trend direction.
pub async fn get_scene_metrics(
    _auth: AuthUser,
    State(state): State<AppState>,
    Path(scene_id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let metrics = TemporalMetricRepo::list_by_scene(&state.pool, scene_id).await?;

    let drift_scores: Vec<f64> = metrics
        .iter()
        .filter_map(|m| m.drift_score)
        .collect();
    let drift_trend = compute_trend_direction(&drift_scores);

    let enriched: Vec<EnrichedTemporalMetric> = metrics
        .into_iter()
        .map(|m| {
            let drift_severity =
                m.drift_score.map(|s| classify_drift(s, DEFAULT_DRIFT_THRESHOLD));
            let grain_quality =
                m.grain_match_score.map(|s| classify_grain_match(s, DEFAULT_GRAIN_THRESHOLD));
            EnrichedTemporalMetric {
                metric: m,
                drift_severity,
                grain_quality,
            }
        })
        .collect();

    let summary = SceneTemporalSummary {
        metrics: enriched,
        drift_trend,
    };

    Ok(Json(DataResponse { data: summary }))
}

// ---------------------------------------------------------------------------
// Segment-level metric
// ---------------------------------------------------------------------------

/// GET /segments/{id}/temporal-metric
///
/// Returns the temporal metric for a single segment.
pub async fn get_segment_metric(
    _auth: AuthUser,
    State(state): State<AppState>,
    Path(segment_id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let metric = TemporalMetricRepo::find_by_segment(&state.pool, segment_id)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "TemporalMetric",
            id: segment_id,
        }))?;

    let drift_severity =
        metric.drift_score.map(|s| classify_drift(s, DEFAULT_DRIFT_THRESHOLD));
    let grain_quality =
        metric.grain_match_score.map(|s| classify_grain_match(s, DEFAULT_GRAIN_THRESHOLD));

    let enriched = EnrichedTemporalMetric {
        metric,
        drift_severity,
        grain_quality,
    };

    Ok(Json(DataResponse { data: enriched }))
}

// ---------------------------------------------------------------------------
// Analysis triggers
// ---------------------------------------------------------------------------

/// POST /segments/{id}/analyze-drift
///
/// Trigger drift analysis for a segment. Records the result.
pub async fn analyze_drift(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(segment_id): Path<DbId>,
    Json(input): Json<AnalyzeDriftInput>,
) -> AppResult<impl IntoResponse> {
    let metric_input = CreateTemporalMetric {
        segment_id,
        drift_score: Some(input.drift_score),
        centering_offset_x: None,
        centering_offset_y: None,
        grain_variance: None,
        grain_match_score: None,
        subject_bbox: input.subject_bbox,
        analysis_version: None,
    };

    let metric = TemporalMetricRepo::upsert(&state.pool, &metric_input).await?;

    tracing::info!(
        segment_id,
        drift_score = input.drift_score,
        user_id = auth.user_id,
        "Drift analysis recorded",
    );

    Ok((StatusCode::CREATED, Json(DataResponse { data: metric })))
}

/// POST /segments/{id}/analyze-grain
///
/// Trigger grain analysis for a segment. Records the result.
pub async fn analyze_grain(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(segment_id): Path<DbId>,
    Json(input): Json<AnalyzeGrainInput>,
) -> AppResult<impl IntoResponse> {
    let metric_input = CreateTemporalMetric {
        segment_id,
        drift_score: None,
        centering_offset_x: None,
        centering_offset_y: None,
        grain_variance: Some(input.grain_variance),
        grain_match_score: Some(input.grain_match_score),
        subject_bbox: None,
        analysis_version: None,
    };

    let metric = TemporalMetricRepo::upsert(&state.pool, &metric_input).await?;

    tracing::info!(
        segment_id,
        grain_match_score = input.grain_match_score,
        user_id = auth.user_id,
        "Grain analysis recorded",
    );

    Ok((StatusCode::CREATED, Json(DataResponse { data: metric })))
}

/// POST /segments/{id}/normalize-grain
///
/// Apply grain normalization for a segment. Records updated metrics.
pub async fn normalize_grain(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(segment_id): Path<DbId>,
    Json(input): Json<NormalizeGrainInput>,
) -> AppResult<impl IntoResponse> {
    let metric_input = CreateTemporalMetric {
        segment_id,
        drift_score: None,
        centering_offset_x: None,
        centering_offset_y: None,
        grain_variance: Some(input.normalized_variance),
        grain_match_score: Some(input.new_match_score),
        subject_bbox: None,
        analysis_version: None,
    };

    let metric = TemporalMetricRepo::upsert(&state.pool, &metric_input).await?;

    tracing::info!(
        segment_id,
        original_variance = input.original_variance,
        normalized_variance = input.normalized_variance,
        user_id = auth.user_id,
        "Grain normalization applied",
    );

    Ok((StatusCode::CREATED, Json(DataResponse { data: metric })))
}

// ---------------------------------------------------------------------------
// Project settings
// ---------------------------------------------------------------------------

/// GET /projects/{id}/temporal-settings
///
/// Returns temporal threshold settings for a project.
pub async fn get_settings(
    _auth: AuthUser,
    State(state): State<AppState>,
    Path(project_id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let settings = TemporalSettingRepo::get_by_project(&state.pool, project_id).await?;
    Ok(Json(DataResponse { data: settings }))
}

/// PUT /projects/{id}/temporal-settings
///
/// Update or create temporal threshold settings for a project.
pub async fn update_settings(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(project_id): Path<DbId>,
    Json(input): Json<CreateTemporalSetting>,
) -> AppResult<impl IntoResponse> {
    // Validate thresholds if provided.
    if let Some(t) = input.drift_threshold {
        validate_drift_threshold(t).map_err(AppError::Core)?;
    }
    if let Some(t) = input.grain_threshold {
        validate_grain_threshold(t).map_err(AppError::Core)?;
    }
    if let Some(t) = input.centering_threshold {
        validate_centering_threshold(t).map_err(AppError::Core)?;
    }

    let setting = TemporalSettingRepo::upsert(&state.pool, project_id, &input).await?;

    tracing::info!(
        project_id,
        setting_id = setting.id,
        user_id = auth.user_id,
        "Temporal settings updated",
    );

    Ok(Json(DataResponse { data: setting }))
}

// ---------------------------------------------------------------------------
// Request input types
// ---------------------------------------------------------------------------

/// Input for drift analysis recording.
#[derive(Debug, serde::Deserialize)]
pub struct AnalyzeDriftInput {
    pub drift_score: f64,
    pub subject_bbox: Option<serde_json::Value>,
}

/// Input for grain analysis recording.
#[derive(Debug, serde::Deserialize)]
pub struct AnalyzeGrainInput {
    pub grain_variance: f64,
    pub grain_match_score: f64,
}

/// Input for grain normalization recording.
#[derive(Debug, serde::Deserialize)]
pub struct NormalizeGrainInput {
    pub original_variance: f64,
    pub normalized_variance: f64,
    pub new_match_score: f64,
}
