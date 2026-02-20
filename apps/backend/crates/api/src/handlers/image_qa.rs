//! Handlers for image quality assurance endpoints.
//!
//! Provides QA check type listing, QA execution against images,
//! result retrieval, and threshold management.

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::Json;
use serde::{Deserialize, Serialize};
use trulience_core::types::DbId;
use trulience_db::models::image_qa::{
    CreateImageQualityScore, ImageQaThreshold, ImageQualityScore, QaCheckType,
    UpsertImageQaThreshold,
};
use trulience_db::repositories::{ImageQaThresholdRepo, ImageQualityScoreRepo, QaCheckTypeRepo};

use crate::error::{AppError, AppResult};
use crate::state::AppState;

// ---------------------------------------------------------------------------
// Script mapping constants
// ---------------------------------------------------------------------------

/// Script that checks resolution and format.
const SCRIPT_RESOLUTION_FORMAT: &str = "qa_resolution_format.py";
/// Check types handled by the resolution/format script.
const CHECKS_RESOLUTION_FORMAT: &[&str] = &["resolution", "format"];

/// Script that checks face detection, centering, and size.
const SCRIPT_FACE_DETECTION: &str = "qa_face_detection.py";
/// Check types handled by the face detection script.
const CHECKS_FACE_DETECTION: &[&str] = &["face_detection", "face_centering", "face_size"];

/// Script that checks sharpness, lighting, and artifacts.
const SCRIPT_IMAGE_QUALITY: &str = "qa_image_quality.py";
/// Check types handled by the image quality script.
const CHECKS_IMAGE_QUALITY: &[&str] = &["sharpness", "lighting", "artifacts"];

/// All script groups: (script filename, list of check names it handles).
const SCRIPT_GROUPS: &[(&str, &[&str])] = &[
    (SCRIPT_RESOLUTION_FORMAT, CHECKS_RESOLUTION_FORMAT),
    (SCRIPT_FACE_DETECTION, CHECKS_FACE_DETECTION),
    (SCRIPT_IMAGE_QUALITY, CHECKS_IMAGE_QUALITY),
];

// ---------------------------------------------------------------------------
// Request / Response types
// ---------------------------------------------------------------------------

/// Request body for the `POST /qa/run` endpoint.
#[derive(Debug, Deserialize)]
pub struct RunQaRequest {
    pub character_id: DbId,
    pub image_variant_id: Option<DbId>,
    pub image_path: String,
    pub is_source_image: bool,
    /// Optional project ID used to look up project-specific thresholds.
    pub project_id: Option<DbId>,
}

/// Response body returned by the `POST /qa/run` endpoint.
#[derive(Debug, Serialize)]
pub struct QaRunResponse {
    pub scores: Vec<ImageQualityScore>,
    /// Aggregate status across all checks: `"pass"`, `"warn"`, or `"fail"`.
    pub overall_status: String,
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/// GET /api/v1/qa/check-types
///
/// Returns all registered QA check types.
pub async fn list_check_types(State(state): State<AppState>) -> AppResult<Json<Vec<QaCheckType>>> {
    let types = QaCheckTypeRepo::list(&state.pool).await?;
    Ok(Json(types))
}

/// POST /api/v1/qa/run
///
/// Runs all QA checks against the specified image. For each check type the
/// effective threshold (project-specific or system default) is loaded, the
/// appropriate Python analysis script is invoked, and the results are stored.
pub async fn run_qa(
    State(state): State<AppState>,
    Json(input): Json<RunQaRequest>,
) -> AppResult<(StatusCode, Json<QaRunResponse>)> {
    let check_types = QaCheckTypeRepo::list(&state.pool).await?;

    // Build a lookup of check_name -> (check_type_id, threshold).
    let mut thresholds = std::collections::HashMap::new();
    for ct in &check_types {
        let threshold = if let Some(pid) = input.project_id {
            ImageQaThresholdRepo::get_effective(&state.pool, pid, ct.id).await?
        } else {
            None
        };
        thresholds.insert(ct.name.as_str(), (ct.id, threshold));
    }

    // Build a config JSON to pass to every script.
    let config = serde_json::json!({
        "character_id": input.character_id,
        "image_variant_id": input.image_variant_id,
        "is_source_image": input.is_source_image,
    });

    // Run each script group and collect individual check results.
    let mut all_scores: Vec<ImageQualityScore> = Vec::new();

    for &(script_name, check_names) in SCRIPT_GROUPS {
        let script_output = run_python_script(script_name, &input.image_path, &config).await?;

        let results = script_output.as_array().ok_or_else(|| {
            AppError::InternalError(format!("Expected array from QA script {script_name}"))
        })?;

        for result in results {
            let check_name = result
                .get("check")
                .and_then(|v| v.as_str())
                .unwrap_or_default();

            // Only process results that belong to this script group.
            if !check_names.contains(&check_name) {
                continue;
            }

            let (check_type_id, threshold) = match thresholds.get(check_name) {
                Some(entry) => (entry.0, &entry.1),
                None => continue, // Unknown check type, skip.
            };

            let raw_score = result.get("score").and_then(|v| v.as_f64());
            let details = result.get("details").cloned();

            let status = determine_status(raw_score, threshold.as_ref());

            let create_dto = CreateImageQualityScore {
                image_variant_id: input.image_variant_id,
                character_id: input.character_id,
                check_type_id,
                score: raw_score,
                status: status.clone(),
                details,
                is_source_image: input.is_source_image,
            };

            let saved = ImageQualityScoreRepo::create(&state.pool, &create_dto).await?;
            all_scores.push(saved);
        }
    }

    let overall_status = compute_overall_status(&all_scores);

    Ok((
        StatusCode::CREATED,
        Json(QaRunResponse {
            scores: all_scores,
            overall_status,
        }),
    ))
}

/// GET /api/v1/qa/image-variants/{id}/results
///
/// Returns QA scores for a specific image variant.
pub async fn get_results(
    State(state): State<AppState>,
    Path(id): Path<DbId>,
) -> AppResult<Json<Vec<ImageQualityScore>>> {
    let scores = ImageQualityScoreRepo::list_by_image_variant(&state.pool, id).await?;
    Ok(Json(scores))
}

/// GET /api/v1/qa/characters/{character_id}/source-qa-results
///
/// Returns QA scores for source images of a character.
pub async fn get_source_results(
    State(state): State<AppState>,
    Path(character_id): Path<DbId>,
) -> AppResult<Json<Vec<ImageQualityScore>>> {
    let scores = ImageQualityScoreRepo::list_by_character_source(&state.pool, character_id).await?;
    Ok(Json(scores))
}

/// GET /api/v1/qa/projects/{project_id}/thresholds
///
/// Returns project-specific thresholds. Falls back to system defaults if
/// the project has no overrides.
pub async fn get_thresholds(
    State(state): State<AppState>,
    Path(project_id): Path<DbId>,
) -> AppResult<Json<Vec<ImageQaThreshold>>> {
    let thresholds = ImageQaThresholdRepo::list_by_project(&state.pool, project_id).await?;
    if thresholds.is_empty() {
        let defaults = ImageQaThresholdRepo::list_defaults(&state.pool).await?;
        return Ok(Json(defaults));
    }
    Ok(Json(thresholds))
}

/// PUT /api/v1/qa/projects/{project_id}/thresholds
///
/// Upserts a threshold for the given project and check type.
pub async fn update_threshold(
    State(state): State<AppState>,
    Path(project_id): Path<DbId>,
    Json(input): Json<UpsertImageQaThreshold>,
) -> AppResult<Json<ImageQaThreshold>> {
    let threshold = ImageQaThresholdRepo::upsert(&state.pool, Some(project_id), &input).await?;
    Ok(Json(threshold))
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/// Run a Python QA analysis script and return its parsed JSON output.
///
/// The script receives the image path and a JSON config string as arguments.
/// It must write a JSON array to stdout.
async fn run_python_script(
    script_name: &str,
    image_path: &str,
    config: &serde_json::Value,
) -> Result<serde_json::Value, AppError> {
    use tokio::process::Command;

    let scripts_dir = std::env::var("SCRIPTS_DIR").unwrap_or_else(|_| "scripts".to_string());
    let script_path = format!("{scripts_dir}/python/qa/{script_name}");

    let config_str = serde_json::to_string(config).unwrap_or_default();

    let output = Command::new("python3")
        .arg(&script_path)
        .arg(image_path)
        .arg(&config_str)
        .output()
        .await
        .map_err(|e| AppError::InternalError(format!("Failed to run QA script: {e}")))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(AppError::InternalError(format!(
            "QA script failed: {stderr}"
        )));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    serde_json::from_str(&stdout)
        .map_err(|e| AppError::InternalError(format!("Invalid QA script output: {e}")))
}

/// Determine pass/warn/fail status from a score and optional threshold.
///
/// - No threshold or no score -> `"pass"` (no enforcement).
/// - Score >= warn_threshold   -> `"pass"`.
/// - Score >= fail_threshold   -> `"warn"`.
/// - Score < fail_threshold    -> `"fail"`.
fn determine_status(score: Option<f64>, threshold: Option<&ImageQaThreshold>) -> String {
    let (score, threshold) = match (score, threshold) {
        (Some(s), Some(t)) => (s, t),
        _ => return "pass".to_string(),
    };

    if score >= threshold.warn_threshold {
        "pass".to_string()
    } else if score >= threshold.fail_threshold {
        "warn".to_string()
    } else {
        "fail".to_string()
    }
}

/// Compute an aggregate status from a collection of individual scores.
///
/// Returns `"fail"` if any score failed, `"warn"` if any warned, else `"pass"`.
fn compute_overall_status(scores: &[ImageQualityScore]) -> String {
    let mut has_warn = false;
    for s in scores {
        match s.status.as_str() {
            "fail" => return "fail".to_string(),
            "warn" => has_warn = true,
            _ => {}
        }
    }
    if has_warn {
        "warn".to_string()
    } else {
        "pass".to_string()
    }
}
