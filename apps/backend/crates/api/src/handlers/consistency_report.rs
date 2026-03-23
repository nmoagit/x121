//! Handlers for the avatar consistency report system (PRD-94).
//!
//! Provides endpoints for generating consistency reports per avatar,
//! retrieving the latest report, listing project-wide reports, and
//! batch-generating reports for all avatars in a project.

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use serde::Deserialize;

use x121_core::consistency_report::{
    compute_overall_consistency, identify_outliers, validate_report_type, OUTLIER_THRESHOLD,
};
use x121_core::error::CoreError;
use x121_core::types::DbId;
use x121_db::models::consistency_report::CreateConsistencyReport;
use x121_db::repositories::{AvatarRepo, ConsistencyReportRepo};

use crate::error::{AppError, AppResult};
use crate::middleware::auth::AuthUser;
use crate::response::DataResponse;
use crate::state::AppState;

// ---------------------------------------------------------------------------
// Request DTOs
// ---------------------------------------------------------------------------

/// Request body for generating a consistency report.
#[derive(Debug, Deserialize)]
pub struct GenerateReportRequest {
    /// Raw similarity scores for each scene (one score per scene).
    pub scores: Vec<f64>,
    /// Report type: `"face"`, `"color"`, or `"full"`.
    #[serde(default = "default_report_type")]
    pub report_type: String,
    /// Project the avatar belongs to.
    pub project_id: DbId,
}

fn default_report_type() -> String {
    "face".to_string()
}

/// Request body for batch report generation across a project.
#[derive(Debug, Deserialize)]
pub struct BatchGenerateRequest {
    /// Report type: `"face"`, `"color"`, or `"full"`.
    #[serde(default = "default_report_type")]
    pub report_type: String,
    /// Per-avatar scores: `{ "avatar_id": [score1, score2, ...] }`.
    pub avatar_scores: std::collections::HashMap<DbId, Vec<f64>>,
}

/// A single entry in the batch generation result.
#[derive(Debug, serde::Serialize)]
struct BatchResultEntry {
    avatar_id: DbId,
    report_id: DbId,
    overall_consistency_score: Option<f64>,
}

/// A single entry in the batch generation error list.
#[derive(Debug, serde::Serialize)]
struct BatchErrorEntry {
    avatar_id: DbId,
    error: String,
}

/// Response for batch generation.
#[derive(Debug, serde::Serialize)]
struct BatchGenerateResponse {
    created: Vec<BatchResultEntry>,
    errors: Vec<BatchErrorEntry>,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Verify that a avatar exists, returning a 404 error if not found.
pub(crate) async fn ensure_avatar_exists(pool: &sqlx::PgPool, avatar_id: DbId) -> AppResult<()> {
    AvatarRepo::find_by_id(pool, avatar_id)
        .await?
        .ok_or_else(|| {
            AppError::Core(CoreError::NotFound {
                entity: "Avatar",
                id: avatar_id,
            })
        })?;
    Ok(())
}

/// Build a `CreateConsistencyReport` DTO from raw scores, computing overall
/// consistency and outlier detection.  Shared by `generate_report` and
/// `batch_generate` to avoid duplicating the computation + DTO assembly.
fn build_report_input(
    avatar_id: DbId,
    project_id: DbId,
    scores: &[f64],
    report_type: String,
) -> Result<CreateConsistencyReport, AppError> {
    let overall = compute_overall_consistency(scores);
    let outlier_indices = identify_outliers(scores, OUTLIER_THRESHOLD);
    let outlier_ids: Vec<DbId> = outlier_indices.iter().map(|&i| i as DbId).collect();

    let scores_json =
        serde_json::to_value(scores).map_err(|e| AppError::InternalError(e.to_string()))?;

    Ok(CreateConsistencyReport {
        avatar_id,
        project_id,
        scores_json,
        overall_consistency_score: Some(overall),
        outlier_scene_ids: if outlier_ids.is_empty() {
            None
        } else {
            Some(outlier_ids)
        },
        report_type,
    })
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/// POST /avatars/{avatar_id}/consistency-report
///
/// Generate a new consistency report for a avatar. Validates the report
/// type, computes overall consistency and outliers from the provided scores,
/// then persists the report.
pub async fn generate_report(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(avatar_id): Path<DbId>,
    Json(input): Json<GenerateReportRequest>,
) -> AppResult<impl IntoResponse> {
    validate_report_type(&input.report_type).map_err(AppError::BadRequest)?;
    ensure_avatar_exists(&state.pool, avatar_id).await?;

    let create = build_report_input(
        avatar_id,
        input.project_id,
        &input.scores,
        input.report_type,
    )?;

    let report = ConsistencyReportRepo::create(&state.pool, &create).await?;

    tracing::info!(
        user_id = auth.user_id,
        avatar_id = avatar_id,
        report_id = report.id,
        overall_score = report.overall_consistency_score,
        "Consistency report generated"
    );

    Ok((StatusCode::CREATED, Json(DataResponse { data: report })))
}

/// GET /avatars/{avatar_id}/consistency-report
///
/// Get the latest consistency report for a avatar.
pub async fn get_latest_report(
    _auth: AuthUser,
    State(state): State<AppState>,
    Path(avatar_id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let report = ConsistencyReportRepo::get_latest_for_avatar(&state.pool, avatar_id)
        .await?
        .ok_or_else(|| {
            AppError::Core(CoreError::NotFound {
                entity: "ConsistencyReport",
                id: avatar_id,
            })
        })?;

    Ok(Json(DataResponse { data: report }))
}

/// GET /projects/{project_id}/consistency-overview
///
/// List all consistency reports for a project (batch overview).
pub async fn list_project_reports(
    _auth: AuthUser,
    State(state): State<AppState>,
    Path(project_id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let reports = ConsistencyReportRepo::list_by_project(&state.pool, project_id).await?;
    Ok(Json(DataResponse { data: reports }))
}

/// GET /consistency-reports/{id}
///
/// Get a single consistency report by ID.
pub async fn get_report(
    _auth: AuthUser,
    State(state): State<AppState>,
    Path(id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let report = ConsistencyReportRepo::get_by_id(&state.pool, id)
        .await?
        .ok_or_else(|| {
            AppError::Core(CoreError::NotFound {
                entity: "ConsistencyReport",
                id,
            })
        })?;

    Ok(Json(DataResponse { data: report }))
}

/// POST /projects/{project_id}/batch-consistency
///
/// Batch-generate consistency reports for multiple avatars in a project.
/// Accepts a map of avatar_id to scores. Creates one report per avatar.
pub async fn batch_generate(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(project_id): Path<DbId>,
    Json(input): Json<BatchGenerateRequest>,
) -> AppResult<impl IntoResponse> {
    validate_report_type(&input.report_type).map_err(AppError::BadRequest)?;

    if input.avatar_scores.is_empty() {
        return Err(AppError::BadRequest(
            "avatar_scores must not be empty".to_string(),
        ));
    }

    let mut created = Vec::new();
    let mut errors = Vec::new();

    for (&avatar_id, scores) in &input.avatar_scores {
        let create =
            match build_report_input(avatar_id, project_id, scores, input.report_type.clone()) {
                Ok(c) => c,
                Err(e) => {
                    errors.push(BatchErrorEntry {
                        avatar_id,
                        error: e.to_string(),
                    });
                    continue;
                }
            };

        match ConsistencyReportRepo::create(&state.pool, &create).await {
            Ok(report) => {
                created.push(BatchResultEntry {
                    avatar_id,
                    report_id: report.id,
                    overall_consistency_score: report.overall_consistency_score,
                });
            }
            Err(e) => {
                errors.push(BatchErrorEntry {
                    avatar_id,
                    error: e.to_string(),
                });
            }
        }
    }

    tracing::info!(
        user_id = auth.user_id,
        project_id = project_id,
        created_count = created.len(),
        error_count = errors.len(),
        "Batch consistency report generation complete"
    );

    Ok((
        StatusCode::CREATED,
        Json(DataResponse {
            data: BatchGenerateResponse { created, errors },
        }),
    ))
}
