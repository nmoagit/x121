//! Handlers for the character readiness system (PRD-107).
//!
//! Provides endpoints for computing readiness, managing readiness criteria,
//! and querying the readiness cache.

use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;

use trulience_core::error::CoreError;
use trulience_core::readiness::{self, validate_criteria_json, validate_scope_type};
use trulience_core::types::DbId;
use trulience_db::models::readiness_criteria::{
    CreateReadinessCriteria, UpdateReadinessCriteria,
};
use trulience_db::repositories::{ReadinessCacheRepo, ReadinessCriteriaRepo};

use crate::error::{AppError, AppResult};
use crate::middleware::auth::AuthUser;
use crate::response::DataResponse;
use crate::state::AppState;

// ---------------------------------------------------------------------------
// Query parameter structs
// ---------------------------------------------------------------------------

/// Query parameters for readiness summary.
#[derive(Debug, serde::Deserialize)]
pub struct ReadinessSummaryParams {
    pub project_id: Option<DbId>,
}

/// Query parameters for listing cache entries by state.
#[derive(Debug, serde::Deserialize)]
pub struct ReadinessStateFilterParams {
    pub state: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

/// Body for batch-evaluate endpoint.
#[derive(Debug, serde::Deserialize)]
pub struct BatchEvaluateBody {
    pub character_ids: Vec<DbId>,
}

// ---------------------------------------------------------------------------
// Character Readiness Handlers
// ---------------------------------------------------------------------------

/// GET /characters/{character_id}/readiness
///
/// Get the cached readiness for a single character.
pub async fn get_character_readiness(
    _auth: AuthUser,
    State(state): State<AppState>,
    Path(character_id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let cache = ReadinessCacheRepo::find_by_character_id(&state.pool, character_id)
        .await?
        .ok_or_else(|| {
            AppError::Core(CoreError::NotFound {
                entity: "CharacterReadinessCache",
                id: character_id,
            })
        })?;

    Ok(Json(DataResponse { data: cache }))
}

/// POST /characters/{character_id}/readiness/invalidate
///
/// Invalidate the readiness cache for a character, forcing recomputation
/// on the next read.
pub async fn invalidate_cache(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(character_id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let deleted =
        ReadinessCacheRepo::delete_by_character_id(&state.pool, character_id).await?;

    tracing::info!(
        user_id = auth.user_id,
        character_id = character_id,
        deleted = deleted,
        "Readiness cache invalidated"
    );

    Ok(StatusCode::NO_CONTENT)
}

/// POST /characters/readiness/batch-evaluate
///
/// Evaluate readiness for a batch of characters. This is a placeholder
/// that records empty results; the actual computation requires joining
/// multiple tables and should be done by a background service.
pub async fn batch_evaluate(
    auth: AuthUser,
    State(state): State<AppState>,
    Json(body): Json<BatchEvaluateBody>,
) -> AppResult<impl IntoResponse> {
    if body.character_ids.is_empty() {
        return Err(AppError::BadRequest(
            "character_ids must not be empty".to_string(),
        ));
    }

    if body.character_ids.len() > 500 {
        return Err(AppError::BadRequest(
            "Cannot batch evaluate more than 500 characters at once".to_string(),
        ));
    }

    // Fetch existing cache entries for these characters.
    let existing =
        ReadinessCacheRepo::find_by_character_ids(&state.pool, &body.character_ids)
            .await?;

    tracing::info!(
        user_id = auth.user_id,
        requested = body.character_ids.len(),
        cached = existing.len(),
        "Batch readiness evaluation requested"
    );

    Ok(Json(DataResponse { data: existing }))
}

// ---------------------------------------------------------------------------
// Library Readiness Summary
// ---------------------------------------------------------------------------

/// GET /library/characters/readiness-summary
///
/// Get aggregate readiness statistics.
pub async fn get_readiness_summary(
    _auth: AuthUser,
    State(state): State<AppState>,
    Query(params): Query<ReadinessSummaryParams>,
) -> AppResult<impl IntoResponse> {
    let project_id = params.project_id.unwrap_or(0);

    let (ready, partially_ready, not_started) =
        ReadinessCacheRepo::summary_by_project(&state.pool, project_id).await?;

    let total = ready + partially_ready + not_started;

    let summary = readiness::ReadinessSummary {
        total: total as usize,
        ready: ready as usize,
        partially_ready: partially_ready as usize,
        not_started: not_started as usize,
    };

    Ok(Json(DataResponse { data: summary }))
}

// ---------------------------------------------------------------------------
// Readiness Criteria CRUD
// ---------------------------------------------------------------------------

/// GET /readiness-criteria
///
/// List all readiness criteria.
pub async fn list_criteria(
    _auth: AuthUser,
    State(state): State<AppState>,
) -> AppResult<impl IntoResponse> {
    let criteria = ReadinessCriteriaRepo::list(&state.pool).await?;
    Ok(Json(DataResponse { data: criteria }))
}

/// POST /readiness-criteria
///
/// Create a new readiness criteria for a scope.
pub async fn create_criteria(
    auth: AuthUser,
    State(state): State<AppState>,
    Json(input): Json<CreateReadinessCriteria>,
) -> AppResult<impl IntoResponse> {
    validate_scope_type(&input.scope_type)
        .map_err(AppError::BadRequest)?;

    validate_criteria_json(&input.criteria_json)
        .map_err(AppError::BadRequest)?;

    let criteria = ReadinessCriteriaRepo::create(&state.pool, &input).await?;

    tracing::info!(
        user_id = auth.user_id,
        criteria_id = criteria.id,
        scope_type = %criteria.scope_type,
        "Readiness criteria created"
    );

    Ok((StatusCode::CREATED, Json(DataResponse { data: criteria })))
}

/// PUT /readiness-criteria/{id}
///
/// Update an existing readiness criteria.
pub async fn update_criteria(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(id): Path<DbId>,
    Json(input): Json<UpdateReadinessCriteria>,
) -> AppResult<impl IntoResponse> {
    if let Some(ref json) = input.criteria_json {
        validate_criteria_json(json).map_err(AppError::BadRequest)?;
    }

    let criteria = ReadinessCriteriaRepo::update(&state.pool, id, &input)
        .await?
        .ok_or_else(|| {
            AppError::Core(CoreError::NotFound {
                entity: "ReadinessCriteria",
                id,
            })
        })?;

    tracing::info!(
        user_id = auth.user_id,
        criteria_id = id,
        "Readiness criteria updated"
    );

    Ok(Json(DataResponse { data: criteria }))
}

/// DELETE /readiness-criteria/{id}
///
/// Delete a readiness criteria.
pub async fn delete_criteria(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let deleted = ReadinessCriteriaRepo::delete(&state.pool, id).await?;

    if !deleted {
        return Err(AppError::Core(CoreError::NotFound {
            entity: "ReadinessCriteria",
            id,
        }));
    }

    tracing::info!(
        user_id = auth.user_id,
        criteria_id = id,
        "Readiness criteria deleted"
    );

    Ok(StatusCode::NO_CONTENT)
}
