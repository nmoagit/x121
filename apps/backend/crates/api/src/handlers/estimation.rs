//! Handlers for cost & resource estimation endpoints (PRD-61).
//!
//! Provides scene/batch estimation, calibration history, and metric recording.

use axum::extract::{Query, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use serde::Deserialize;
use trulience_core::estimation;
use trulience_core::generation::{estimate_segments, DEFAULT_SEGMENT_DURATION_SECS};
use trulience_db::models::generation_metric::{EstimateRequest, RecordMetricInput};
use trulience_db::repositories::GenerationMetricRepo;

use crate::error::{AppError, AppResult};
use crate::middleware::rbac::RequireAuth;
use crate::response::DataResponse;
use crate::state::AppState;

// ---------------------------------------------------------------------------
// Query parameters
// ---------------------------------------------------------------------------

/// Pagination query parameters for the calibration history endpoint.
#[derive(Debug, Deserialize)]
pub struct PaginationQuery {
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

// ---------------------------------------------------------------------------
// POST /estimates — compute a batch estimate
// ---------------------------------------------------------------------------

/// Compute resource estimates for a list of scenes.
///
/// Looks up calibration metrics for each (workflow, resolution_tier) pair,
/// then delegates to the pure estimation functions in `trulience_core`.
pub async fn estimate_scenes(
    State(state): State<AppState>,
    RequireAuth(_user): RequireAuth,
    Json(body): Json<EstimateRequest>,
) -> AppResult<impl IntoResponse> {
    // CoreError auto-converts to AppError via #[from] -- no .map_err needed (DRY-275).
    estimation::validate_estimate_count(body.scenes.len())?;

    // Collect unique (workflow_id, resolution_tier_id) pairs for batch lookup.
    let pairs: Vec<(i64, i64)> = body
        .scenes
        .iter()
        .map(|s| (s.workflow_id, s.resolution_tier_id))
        .collect();

    let metrics = GenerationMetricRepo::find_metrics_for_scenes(&state.pool, &pairs).await?;

    // Build per-scene estimates.
    let scene_estimates: Vec<estimation::SceneEstimate> = body
        .scenes
        .iter()
        .map(|scene| {
            let segment_dur = scene
                .segment_duration_secs
                .unwrap_or(DEFAULT_SEGMENT_DURATION_SECS);
            let segments_needed = estimate_segments(scene.target_duration_secs, segment_dur);

            // Find matching metric for this (workflow, tier) pair.
            let metric = metrics.iter().find(|m| {
                m.workflow_id == scene.workflow_id
                    && m.resolution_tier_id == scene.resolution_tier_id
            });

            match metric {
                Some(m) => estimation::estimate_scene(
                    segments_needed,
                    m.avg_gpu_secs_per_segment,
                    m.avg_disk_mb_per_segment,
                    m.sample_count,
                ),
                None => estimation::estimate_scene(segments_needed, 0.0, 0.0, 0),
            }
        })
        .collect();

    let worker_count = body.worker_count.unwrap_or(1);
    let batch = estimation::estimate_batch(scene_estimates, worker_count);

    Ok(Json(DataResponse { data: batch }))
}

// ---------------------------------------------------------------------------
// GET /estimates/history — list calibration data
// ---------------------------------------------------------------------------

/// List all calibration data (generation metrics), paginated.
pub async fn list_calibration_data(
    State(state): State<AppState>,
    RequireAuth(_user): RequireAuth,
    Query(params): Query<PaginationQuery>,
) -> AppResult<impl IntoResponse> {
    let limit = trulience_core::search::clamp_limit(params.limit, 50, 200);
    let offset = trulience_core::search::clamp_offset(params.offset);

    let metrics = GenerationMetricRepo::list_all(&state.pool, limit, offset).await?;
    Ok(Json(DataResponse { data: metrics }))
}

// ---------------------------------------------------------------------------
// POST /estimates/record — record a metric observation
// ---------------------------------------------------------------------------

/// Record a single generation metric observation.
///
/// Called by workers after a generation completes. Uses upsert with
/// incremental mean to update the running averages.
pub async fn record_metric(
    State(state): State<AppState>,
    RequireAuth(user): RequireAuth,
    Json(input): Json<RecordMetricInput>,
) -> AppResult<impl IntoResponse> {
    if input.gpu_secs < 0.0 {
        return Err(AppError::BadRequest(
            "gpu_secs must be non-negative".into(),
        ));
    }
    if input.disk_mb < 0.0 {
        return Err(AppError::BadRequest(
            "disk_mb must be non-negative".into(),
        ));
    }

    let metric = GenerationMetricRepo::upsert_metric(&state.pool, &input).await?;

    tracing::info!(
        metric_id = metric.id,
        workflow_id = metric.workflow_id,
        tier_id = metric.resolution_tier_id,
        sample_count = metric.sample_count,
        user_id = user.user_id,
        "Generation metric recorded",
    );

    Ok((StatusCode::CREATED, Json(DataResponse { data: metric })))
}
