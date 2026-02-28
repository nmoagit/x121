//! Handlers for Smart Auto-Retry policy and attempt management (PRD-71).
//!
//! Covers retry policy CRUD on scene types, retry attempt CRUD per segment,
//! and best-of-N attempt selection.

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::Json;
use serde::{Deserialize, Serialize};
use x121_core::auto_retry::{MAX_RETRY_ATTEMPTS, MIN_RETRY_ATTEMPTS};
use x121_core::error::CoreError;
use x121_core::types::DbId;
use x121_db::models::retry_attempt::{CreateRetryAttempt, RetryAttempt, UpdateRetryAttempt};
use x121_db::models::scene_type::SceneType;
use x121_db::repositories::{RetryAttemptRepo, SceneTypeRepo};

use crate::error::{AppError, AppResult};
use crate::handlers::scene_type_inheritance::ensure_scene_type_exists;
use crate::state::AppState;

// ---------------------------------------------------------------------------
// Request / response types
// ---------------------------------------------------------------------------

/// Request body for updating a scene type's retry policy.
#[derive(Debug, Deserialize)]
pub struct UpdateRetryPolicyRequest {
    pub enabled: Option<bool>,
    pub max_attempts: Option<i32>,
    pub trigger_checks: Option<Vec<String>>,
    pub seed_variation: Option<bool>,
    pub cfg_jitter: Option<f64>,
}

/// Response for a scene type's retry policy.
#[derive(Debug, Serialize)]
pub struct RetryPolicyResponse {
    pub enabled: bool,
    pub max_attempts: i32,
    pub trigger_checks: Option<Vec<String>>,
    pub seed_variation: bool,
    pub cfg_jitter: Option<f64>,
}

/// Request body for creating a retry attempt.
#[derive(Debug, Deserialize)]
pub struct CreateRetryAttemptRequest {
    pub attempt_number: i32,
    pub seed: i64,
    pub parameters: serde_json::Value,
    pub original_parameters: serde_json::Value,
}

/// Request body for updating a retry attempt.
#[derive(Debug, Deserialize)]
pub struct UpdateRetryAttemptRequest {
    pub output_video_path: Option<String>,
    pub quality_scores: Option<serde_json::Value>,
    pub overall_status: Option<String>,
    pub is_selected: Option<bool>,
    pub gpu_seconds: Option<f64>,
    pub failure_reason: Option<String>,
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/// Build a retry policy response from a scene type row.
fn build_retry_policy_response(st: &SceneType) -> RetryPolicyResponse {
    RetryPolicyResponse {
        enabled: st.auto_retry_enabled,
        max_attempts: st.auto_retry_max_attempts,
        trigger_checks: st.auto_retry_trigger_checks.clone(),
        seed_variation: st.auto_retry_seed_variation,
        cfg_jitter: st.auto_retry_cfg_jitter,
    }
}

/// Load a retry attempt by ID or return 404.
async fn ensure_retry_attempt_exists(
    pool: &sqlx::PgPool,
    attempt_id: DbId,
) -> AppResult<RetryAttempt> {
    RetryAttemptRepo::find_by_id(pool, attempt_id)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "RetryAttempt",
            id: attempt_id,
        }))
}

// ---------------------------------------------------------------------------
// Retry policy handlers (scene-type scoped)
// ---------------------------------------------------------------------------

/// GET /api/v1/scene-types/{id}/retry-policy
///
/// Return the auto-retry policy for a scene type.
pub async fn get_retry_policy(
    State(state): State<AppState>,
    Path(id): Path<DbId>,
) -> AppResult<Json<RetryPolicyResponse>> {
    let scene_type = ensure_scene_type_exists(&state.pool, id).await?;
    Ok(Json(build_retry_policy_response(&scene_type)))
}

/// PUT /api/v1/scene-types/{id}/retry-policy
///
/// Update the auto-retry policy on a scene type.
pub async fn update_retry_policy(
    State(state): State<AppState>,
    Path(id): Path<DbId>,
    Json(body): Json<UpdateRetryPolicyRequest>,
) -> AppResult<Json<RetryPolicyResponse>> {
    // Validate max_attempts range if provided.
    if let Some(max) = body.max_attempts {
        if !(MIN_RETRY_ATTEMPTS..=MAX_RETRY_ATTEMPTS).contains(&max) {
            return Err(AppError::BadRequest(format!(
                "max_attempts must be between {MIN_RETRY_ATTEMPTS} and {MAX_RETRY_ATTEMPTS}"
            )));
        }
    }

    let update = x121_db::models::scene_type::UpdateSceneType {
        auto_retry_enabled: body.enabled,
        auto_retry_max_attempts: body.max_attempts,
        auto_retry_trigger_checks: body.trigger_checks,
        auto_retry_seed_variation: body.seed_variation,
        auto_retry_cfg_jitter: body.cfg_jitter,
        ..Default::default()
    };

    let updated = SceneTypeRepo::update(&state.pool, id, &update)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "SceneType",
            id,
        }))?;

    Ok(Json(build_retry_policy_response(&updated)))
}

// ---------------------------------------------------------------------------
// Retry attempt handlers (segment scoped)
// ---------------------------------------------------------------------------

/// GET /api/v1/segments/{id}/retry-attempts
///
/// List all retry attempts for a segment, ordered by attempt number.
pub async fn list_retry_history(
    State(state): State<AppState>,
    Path(segment_id): Path<DbId>,
) -> AppResult<Json<Vec<RetryAttempt>>> {
    let attempts = RetryAttemptRepo::list_by_segment(&state.pool, segment_id).await?;
    Ok(Json(attempts))
}

/// GET /api/v1/segments/{id}/retry-attempts/{aid}
///
/// Get a single retry attempt by ID.
pub async fn get_retry_attempt(
    State(state): State<AppState>,
    Path((_segment_id, attempt_id)): Path<(DbId, DbId)>,
) -> AppResult<Json<RetryAttempt>> {
    let attempt = ensure_retry_attempt_exists(&state.pool, attempt_id).await?;
    Ok(Json(attempt))
}

/// POST /api/v1/segments/{id}/retry-attempts
///
/// Create a new retry attempt for a segment.
pub async fn create_retry_attempt(
    State(state): State<AppState>,
    Path(segment_id): Path<DbId>,
    Json(body): Json<CreateRetryAttemptRequest>,
) -> AppResult<(StatusCode, Json<RetryAttempt>)> {
    let input = CreateRetryAttempt {
        segment_id,
        attempt_number: body.attempt_number,
        seed: body.seed,
        parameters: body.parameters,
        original_parameters: body.original_parameters,
    };
    let attempt = RetryAttemptRepo::create(&state.pool, &input).await?;
    Ok((StatusCode::CREATED, Json(attempt)))
}

/// PUT /api/v1/segments/{id}/retry-attempts/{aid}
///
/// Update a retry attempt (status, scores, etc.).
pub async fn update_retry_attempt(
    State(state): State<AppState>,
    Path((_segment_id, attempt_id)): Path<(DbId, DbId)>,
    Json(body): Json<UpdateRetryAttemptRequest>,
) -> AppResult<Json<RetryAttempt>> {
    let input = UpdateRetryAttempt {
        output_video_path: body.output_video_path,
        quality_scores: body.quality_scores,
        overall_status: body.overall_status,
        is_selected: body.is_selected,
        gpu_seconds: body.gpu_seconds,
        failure_reason: body.failure_reason,
    };
    let attempt = RetryAttemptRepo::update(&state.pool, attempt_id, &input)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "RetryAttempt",
            id: attempt_id,
        }))?;
    Ok(Json(attempt))
}

/// POST /api/v1/segments/{id}/retry-attempts/{aid}/select
///
/// Mark a retry attempt as the selected best-of-N result.
pub async fn select_retry_attempt(
    State(state): State<AppState>,
    Path((_segment_id, attempt_id)): Path<(DbId, DbId)>,
) -> AppResult<Json<RetryAttempt>> {
    let attempt = RetryAttemptRepo::select_attempt(&state.pool, attempt_id)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "RetryAttempt",
            id: attempt_id,
        }))?;
    Ok(Json(attempt))
}
