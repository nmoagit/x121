//! Handlers for QA rulesets: profiles, scene-type overrides, threshold
//! resolution, and A/B testing (PRD-91).

use std::collections::HashMap;

use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::Json;
use serde::Deserialize;
use x121_core::error::CoreError;
use x121_core::qa_ruleset::{self, MetricThreshold, ResolvedThresholds};
use x121_core::types::DbId;
use x121_db::models::qa_profile::{CreateQaProfile, QaProfile, UpdateQaProfile};
use x121_db::models::qa_threshold::QaThreshold;
use x121_db::models::scene_type_qa_override::{SceneTypeQaOverride, UpsertSceneTypeQaOverride};
use x121_db::repositories::{QaProfileRepo, QaThresholdRepo, SceneTypeQaOverrideRepo};

use crate::error::{AppError, AppResult};
use crate::handlers::scene_type_inheritance::ensure_scene_type_exists;
use crate::response::DataResponse;
use crate::state::AppState;

// ---------------------------------------------------------------------------
// QA Profile CRUD
// ---------------------------------------------------------------------------

/// GET /api/v1/qa-profiles
///
/// List all QA profiles.
pub async fn list_profiles(
    State(state): State<AppState>,
) -> AppResult<Json<DataResponse<Vec<QaProfile>>>> {
    let profiles = QaProfileRepo::list(&state.pool).await?;
    Ok(Json(DataResponse { data: profiles }))
}

/// GET /api/v1/qa-profiles/:id
///
/// Get a single QA profile by ID.
pub async fn get_profile(
    State(state): State<AppState>,
    Path(id): Path<DbId>,
) -> AppResult<Json<DataResponse<QaProfile>>> {
    let profile = ensure_qa_profile_exists(&state.pool, id).await?;
    Ok(Json(DataResponse { data: profile }))
}

/// POST /api/v1/qa-profiles
///
/// Create a new QA profile.
pub async fn create_profile(
    State(state): State<AppState>,
    Json(input): Json<CreateQaProfile>,
) -> AppResult<(StatusCode, Json<DataResponse<QaProfile>>)> {
    let profile = QaProfileRepo::create(&state.pool, &input).await?;
    Ok((StatusCode::CREATED, Json(DataResponse { data: profile })))
}

/// PUT /api/v1/qa-profiles/:id
///
/// Update an existing QA profile.
pub async fn update_profile(
    State(state): State<AppState>,
    Path(id): Path<DbId>,
    Json(input): Json<UpdateQaProfile>,
) -> AppResult<Json<DataResponse<QaProfile>>> {
    let profile = QaProfileRepo::update(&state.pool, id, &input)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "QaProfile",
            id,
        }))?;
    Ok(Json(DataResponse { data: profile }))
}

/// DELETE /api/v1/qa-profiles/:id
///
/// Delete a QA profile (built-in profiles cannot be deleted).
pub async fn delete_profile(
    State(state): State<AppState>,
    Path(id): Path<DbId>,
) -> AppResult<StatusCode> {
    let profile = ensure_qa_profile_exists(&state.pool, id).await?;

    if profile.is_builtin {
        return Err(AppError::BadRequest(
            "Built-in profiles cannot be deleted".to_string(),
        ));
    }

    QaProfileRepo::delete(&state.pool, id).await?;
    Ok(StatusCode::NO_CONTENT)
}

// ---------------------------------------------------------------------------
// Scene Type QA Override CRUD
// ---------------------------------------------------------------------------

/// GET /api/v1/scene-types/:id/qa-override
///
/// Get the QA override for a scene type.
pub async fn get_scene_type_qa_override(
    State(state): State<AppState>,
    Path(scene_type_id): Path<DbId>,
) -> AppResult<Json<DataResponse<SceneTypeQaOverride>>> {
    ensure_scene_type_exists(&state.pool, scene_type_id).await?;

    let override_row = SceneTypeQaOverrideRepo::find_by_scene_type(&state.pool, scene_type_id)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "SceneTypeQaOverride",
            id: scene_type_id,
        }))?;
    Ok(Json(DataResponse { data: override_row }))
}

/// PUT /api/v1/scene-types/:id/qa-override
///
/// Create or update the QA override for a scene type.
pub async fn upsert_scene_type_qa_override(
    State(state): State<AppState>,
    Path(scene_type_id): Path<DbId>,
    Json(input): Json<UpsertSceneTypeQaOverride>,
) -> AppResult<Json<DataResponse<SceneTypeQaOverride>>> {
    ensure_scene_type_exists(&state.pool, scene_type_id).await?;

    // If a qa_profile_id is provided, verify it exists.
    if let Some(profile_id) = input.qa_profile_id {
        ensure_qa_profile_exists(&state.pool, profile_id).await?;
    }

    let override_row = SceneTypeQaOverrideRepo::upsert(&state.pool, scene_type_id, &input).await?;
    Ok(Json(DataResponse { data: override_row }))
}

/// DELETE /api/v1/scene-types/:id/qa-override
///
/// Remove the QA override for a scene type.
pub async fn delete_scene_type_qa_override(
    State(state): State<AppState>,
    Path(scene_type_id): Path<DbId>,
) -> AppResult<StatusCode> {
    ensure_scene_type_exists(&state.pool, scene_type_id).await?;

    let deleted = SceneTypeQaOverrideRepo::delete_by_scene_type(&state.pool, scene_type_id).await?;
    if deleted {
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(AppError::Core(CoreError::NotFound {
            entity: "SceneTypeQaOverride",
            id: scene_type_id,
        }))
    }
}

// ---------------------------------------------------------------------------
// Effective threshold resolution
// ---------------------------------------------------------------------------

/// Query parameters for effective threshold resolution.
#[derive(Debug, Deserialize)]
pub struct EffectiveThresholdsQuery {
    pub project_id: Option<DbId>,
}

/// GET /api/v1/scene-types/:id/effective-thresholds?project_id=...
///
/// Resolve the effective QA thresholds for a scene type, applying the full
/// resolution chain: studio defaults -> project overrides -> profile -> custom.
pub async fn resolve_effective_thresholds(
    State(state): State<AppState>,
    Path(scene_type_id): Path<DbId>,
    Query(query): Query<EffectiveThresholdsQuery>,
) -> AppResult<Json<DataResponse<ResolvedThresholds>>> {
    ensure_scene_type_exists(&state.pool, scene_type_id).await?;

    let effective = load_effective_thresholds(&state, scene_type_id, query.project_id).await?;

    Ok(Json(DataResponse { data: effective }))
}

// ---------------------------------------------------------------------------
// A/B test
// ---------------------------------------------------------------------------

/// Request body for the A/B threshold test endpoint.
#[derive(Debug, Deserialize)]
pub struct AbTestRequest {
    pub scene_type_id: DbId,
    pub proposed_thresholds: ResolvedThresholds,
    pub project_id: Option<DbId>,
    pub window_days: Option<i64>,
}

/// POST /api/v1/qa-profiles/ab-test
///
/// Compare proposed thresholds against the current effective thresholds
/// using historical quality scores for segments in scenes of the given
/// scene type.
pub async fn ab_test_thresholds(
    State(state): State<AppState>,
    Json(body): Json<AbTestRequest>,
) -> AppResult<Json<DataResponse<qa_ruleset::AbTestResult>>> {
    ensure_scene_type_exists(&state.pool, body.scene_type_id).await?;

    let current = load_effective_thresholds(&state, body.scene_type_id, body.project_id).await?;

    // Load historical quality_scores for segments belonging to scenes of this scene type.
    let window = body.window_days.unwrap_or(30);
    let scores = load_historical_scores(&state, body.scene_type_id, window).await?;

    let result = qa_ruleset::run_ab_test(&scores, &current, &body.proposed_thresholds);
    Ok(Json(DataResponse { data: result }))
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Look up a QA profile by ID, returning `NotFound` if missing.
async fn ensure_qa_profile_exists(pool: &sqlx::PgPool, id: DbId) -> AppResult<QaProfile> {
    QaProfileRepo::find_by_id(pool, id)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "QaProfile",
            id,
        }))
}

/// Load the fully-resolved effective thresholds for a scene type.
///
/// Applies the 4-layer merge: studio defaults -> project overrides -> profile -> custom.
async fn load_effective_thresholds(
    state: &AppState,
    scene_type_id: DbId,
    project_id: Option<DbId>,
) -> AppResult<ResolvedThresholds> {
    // 1. Studio defaults.
    let studio_rows = QaThresholdRepo::list_studio_defaults(&state.pool).await?;
    let studio_defaults = thresholds_from_rows(&studio_rows);

    // 2. Project overrides.
    let project_overrides = if let Some(pid) = project_id {
        let project_rows = QaThresholdRepo::list_for_project(&state.pool, pid).await?;
        thresholds_from_rows(&project_rows)
    } else {
        HashMap::new()
    };

    // 3. Scene type QA override (profile + custom thresholds).
    let override_row =
        SceneTypeQaOverrideRepo::find_by_scene_type(&state.pool, scene_type_id).await?;
    let (profile_thresholds, custom_thresholds) =
        extract_override_thresholds(state, &override_row).await?;

    // 4. Resolve.
    Ok(qa_ruleset::resolve_thresholds(
        &studio_defaults,
        &project_overrides,
        profile_thresholds.as_ref(),
        custom_thresholds.as_ref(),
    ))
}

/// Convert QA threshold DB rows into a `ResolvedThresholds` map.
fn thresholds_from_rows(rows: &[QaThreshold]) -> ResolvedThresholds {
    rows.iter()
        .filter(|r| r.is_enabled)
        .map(|r| {
            (
                r.check_type.clone(),
                MetricThreshold {
                    warn: r.warn_threshold,
                    fail: r.fail_threshold,
                },
            )
        })
        .collect()
}

/// Extract profile thresholds and custom thresholds from an override row.
async fn extract_override_thresholds(
    state: &AppState,
    override_row: &Option<SceneTypeQaOverride>,
) -> AppResult<(Option<ResolvedThresholds>, Option<ResolvedThresholds>)> {
    let Some(orow) = override_row else {
        return Ok((None, None));
    };

    // Profile thresholds (if a profile is linked).
    let profile_thresholds = if let Some(pid) = orow.qa_profile_id {
        let profile = QaProfileRepo::find_by_id(&state.pool, pid).await?;
        profile.and_then(|p| serde_json::from_value(p.thresholds).ok())
    } else {
        None
    };

    // Custom thresholds (JSONB -> ResolvedThresholds).
    let custom_thresholds: Option<ResolvedThresholds> = orow
        .custom_thresholds
        .as_ref()
        .and_then(|v| serde_json::from_value(v.clone()).ok());

    Ok((profile_thresholds, custom_thresholds))
}

/// Internal row type for the historical scores query.
#[derive(sqlx::FromRow)]
struct ScoreRow {
    check_type: String,
    score: f64,
}

/// Load historical (check_type, score) pairs for segments in scenes of the
/// given scene type, within the specified time window.
async fn load_historical_scores(
    state: &AppState,
    scene_type_id: DbId,
    window_days: i64,
) -> AppResult<Vec<(String, f64)>> {
    let rows = sqlx::query_as::<_, ScoreRow>(
        "SELECT qs.check_type, qs.score \
         FROM quality_scores qs \
         JOIN segments seg ON seg.id = qs.segment_id \
         JOIN scenes sc ON sc.id = seg.scene_id \
         WHERE sc.scene_type_id = $1 \
           AND qs.created_at >= NOW() - make_interval(days => $2::int) \
         ORDER BY qs.created_at DESC",
    )
    .bind(scene_type_id)
    .bind(window_days as i32)
    .fetch_all(&state.pool)
    .await?;

    Ok(rows.into_iter().map(|r| (r.check_type, r.score)).collect())
}
