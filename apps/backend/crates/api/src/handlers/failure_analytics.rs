//! Handlers for failure pattern analytics endpoints (PRD-64).
//!
//! Provides pattern listing, heatmap generation, trend tracking, alert
//! checking, and fix management for correlating quality gate failures with
//! generation parameters.

use axum::extract::{Path, Query, State};
use axum::response::IntoResponse;
use axum::Json;
use serde::Deserialize;
use x121_core::failure_tracking::{self, PatternInput};
use x121_core::types::DbId;
use x121_db::models::failure_pattern::{HeatmapCellResponse, HeatmapData, TrendPointResponse};
use x121_db::models::pattern_fix::CreatePatternFix;
use x121_db::repositories::{FailurePatternRepo, PatternFixRepo};

use crate::error::AppResult;
use crate::middleware::auth::AuthUser;
use crate::response::DataResponse;
use crate::state::AppState;

// ---------------------------------------------------------------------------
// Query parameter structs
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
pub struct PatternListParams {
    pub limit: Option<i64>,
    pub offset: Option<i64>,
    pub severity: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct HeatmapParams {
    pub row_dimension: Option<String>,
    pub col_dimension: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct TrendParams {
    pub pattern_id: DbId,
    pub period_days: Option<i32>,
}

#[derive(Debug, Deserialize)]
pub struct AlertParams {
    pub workflow_id: Option<DbId>,
    pub character_id: Option<DbId>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateEffectiveness {
    pub effectiveness: String,
}

// ---------------------------------------------------------------------------
// Pattern listing
// ---------------------------------------------------------------------------

/// GET /api/v1/analytics/failure-patterns
///
/// Lists failure patterns with optional severity filter, ordered by failure
/// rate descending.
pub async fn list_patterns(
    State(state): State<AppState>,
    Query(params): Query<PatternListParams>,
) -> AppResult<impl IntoResponse> {
    let patterns = FailurePatternRepo::list(
        &state.pool,
        params.limit,
        params.offset,
        params.severity.as_deref(),
    )
    .await?;
    Ok(Json(DataResponse { data: patterns }))
}

/// GET /api/v1/analytics/failure-patterns/{id}
///
/// Returns a single failure pattern by ID.
pub async fn get_pattern(
    State(state): State<AppState>,
    Path(id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let pattern = FailurePatternRepo::find_by_id(&state.pool, id).await?;
    Ok(Json(DataResponse { data: pattern }))
}

// ---------------------------------------------------------------------------
// Heatmap
// ---------------------------------------------------------------------------

/// GET /api/v1/analytics/failure-heatmap
///
/// Returns heatmap matrix data with configurable row/column dimensions.
/// Defaults to `workflow` (rows) x `character` (columns).
pub async fn get_heatmap(
    State(state): State<AppState>,
    Query(params): Query<HeatmapParams>,
) -> AppResult<impl IntoResponse> {
    let row_dim = params.row_dimension.as_deref().unwrap_or("workflow");
    let col_dim = params.col_dimension.as_deref().unwrap_or("character");

    let patterns = FailurePatternRepo::get_heatmap_data(&state.pool, row_dim, col_dim).await?;

    // Convert DB rows into PatternInput for the core heatmap builder.
    let inputs: Vec<PatternInput> = patterns
        .iter()
        .map(|p| {
            let row_label = dimension_label(p, row_dim);
            let col_label = dimension_label(p, col_dim);
            PatternInput {
                row_label,
                col_label,
                failure_count: p.failure_count,
                total_count: p.total_count,
            }
        })
        .collect();

    let cells = failure_tracking::build_heatmap_matrix(&inputs);

    // Extract unique sorted labels.
    let mut row_labels: Vec<String> = cells.iter().map(|c| c.row_label.clone()).collect();
    row_labels.sort();
    row_labels.dedup();

    let mut col_labels: Vec<String> = cells.iter().map(|c| c.col_label.clone()).collect();
    col_labels.sort();
    col_labels.dedup();

    let cell_responses: Vec<HeatmapCellResponse> = cells
        .into_iter()
        .map(|c| HeatmapCellResponse {
            row: c.row_label,
            col: c.col_label,
            failure_rate: c.failure_rate,
            sample_count: c.sample_count,
            severity: c.severity.as_str().to_string(),
        })
        .collect();

    let data = HeatmapData {
        cells: cell_responses,
        row_labels,
        col_labels,
    };

    Ok(Json(DataResponse { data }))
}

// ---------------------------------------------------------------------------
// Trends
// ---------------------------------------------------------------------------

/// GET /api/v1/analytics/failure-trends
///
/// Returns time-series trend data for a specific pattern.
pub async fn get_trends(
    State(state): State<AppState>,
    Query(params): Query<TrendParams>,
) -> AppResult<impl IntoResponse> {
    let period_days = params.period_days.unwrap_or(30);
    let trend_data =
        FailurePatternRepo::get_trend_data(&state.pool, params.pattern_id, period_days).await?;

    let points: Vec<TrendPointResponse> = trend_data
        .into_iter()
        .map(|(period, rate, count)| TrendPointResponse {
            period,
            failure_rate: rate,
            sample_count: count,
        })
        .collect();

    Ok(Json(DataResponse { data: points }))
}

// ---------------------------------------------------------------------------
// Alerts
// ---------------------------------------------------------------------------

/// GET /api/v1/analytics/failure-alerts
///
/// Returns high-severity patterns matching the specified dimensions for
/// proactive alerting when configuring scenes.
pub async fn check_alerts(
    State(state): State<AppState>,
    Query(params): Query<AlertParams>,
) -> AppResult<impl IntoResponse> {
    // Fetch high-severity patterns that match the requested dimensions.
    let mut all_patterns =
        FailurePatternRepo::list(&state.pool, Some(100), Some(0), Some("high")).await?;

    // Filter to patterns matching the requested dimensions.
    all_patterns.retain(|p| {
        let workflow_match = params
            .workflow_id
            .map_or(true, |wid| p.dimension_workflow_id == Some(wid));
        let character_match = params
            .character_id
            .map_or(true, |cid| p.dimension_character_id == Some(cid));
        workflow_match && character_match
    });

    Ok(Json(DataResponse { data: all_patterns }))
}

// ---------------------------------------------------------------------------
// Pattern fixes
// ---------------------------------------------------------------------------

/// POST /api/v1/failure-patterns/{id}/fixes
///
/// Records a new fix for a failure pattern.
pub async fn create_fix(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(pattern_id): Path<DbId>,
    Json(body): Json<CreatePatternFix>,
) -> AppResult<impl IntoResponse> {
    let fix = PatternFixRepo::create(&state.pool, pattern_id, &body, auth.user_id).await?;
    Ok(Json(DataResponse { data: fix }))
}

/// GET /api/v1/failure-patterns/{id}/fixes
///
/// Lists all fixes for a specific failure pattern.
pub async fn list_fixes(
    State(state): State<AppState>,
    Path(pattern_id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let fixes = PatternFixRepo::list_by_pattern(&state.pool, pattern_id).await?;
    Ok(Json(DataResponse { data: fixes }))
}

/// PATCH /api/v1/failure-patterns/fixes/{id}/effectiveness
///
/// Updates the effectiveness rating of a fix.
pub async fn update_fix_effectiveness(
    State(state): State<AppState>,
    _auth: AuthUser,
    Path(id): Path<DbId>,
    Json(body): Json<UpdateEffectiveness>,
) -> AppResult<impl IntoResponse> {
    let fix = PatternFixRepo::update_effectiveness(&state.pool, id, &body.effectiveness).await?;
    Ok(Json(DataResponse { data: fix }))
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Extract a human-readable label for a dimension from a pattern row.
fn dimension_label(
    pattern: &x121_db::models::failure_pattern::FailurePattern,
    dimension: &str,
) -> String {
    match dimension {
        "workflow" => pattern
            .dimension_workflow_id
            .map(|id| format!("Workflow {id}"))
            .unwrap_or_default(),
        "lora" => pattern
            .dimension_lora_id
            .map(|id| format!("LoRA {id}"))
            .unwrap_or_default(),
        "character" => pattern
            .dimension_character_id
            .map(|id| format!("Character {id}"))
            .unwrap_or_default(),
        "scene_type" => pattern
            .dimension_scene_type_id
            .map(|id| format!("Scene Type {id}"))
            .unwrap_or_default(),
        "segment_position" => pattern
            .dimension_segment_position
            .clone()
            .unwrap_or_default(),
        _ => String::new(),
    }
}
