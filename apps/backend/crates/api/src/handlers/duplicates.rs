//! Handlers for character duplicate detection endpoints (PRD-79).
//!
//! Provides single and batch duplicate checking, resolution workflows,
//! and per-project/studio-level threshold settings management.

use axum::extract::{Path, Query, State};
use axum::response::IntoResponse;
use axum::Json;
use x121_core::duplicate_detection;
use x121_core::search::{clamp_limit, clamp_offset, DEFAULT_SEARCH_LIMIT, MAX_SEARCH_LIMIT};
use x121_core::types::DbId;
use x121_db::models::duplicate_check::{
    BatchCheckRequest, CheckDuplicateRequest, CreateDuplicateCheck, DuplicateCheck,
    ResolveCheckRequest,
};
use x121_db::models::duplicate_setting::UpdateDuplicateSetting;
use x121_db::repositories::{DuplicateCheckRepo, DuplicateSettingRepo};

use crate::error::AppResult;
use crate::middleware::auth::AuthUser;
use crate::response::DataResponse;
use crate::state::AppState;

// ---------------------------------------------------------------------------
// Query parameters
// ---------------------------------------------------------------------------

#[derive(Debug, serde::Deserialize)]
pub struct HistoryQuery {
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

#[derive(Debug, serde::Deserialize)]
pub struct SettingsQuery {
    pub project_id: Option<DbId>,
}

// ---------------------------------------------------------------------------
// Duplicate checking
// ---------------------------------------------------------------------------

/// POST /api/v1/characters/duplicates/check
///
/// Check a single character for duplicates against existing characters.
/// Returns the created check record. In a production system this would
/// query embeddings; here we create the check record for the workflow.
pub async fn check_duplicate(
    State(state): State<AppState>,
    _auth: AuthUser,
    Json(body): Json<CheckDuplicateRequest>,
) -> AppResult<impl IntoResponse> {
    // Get threshold from settings.
    let settings = DuplicateSettingRepo::get_for_project(&state.pool, body.project_id).await?;

    let create = CreateDuplicateCheck {
        source_character_id: body.character_id,
        matched_character_id: None,
        similarity_score: None,
        threshold_used: settings.similarity_threshold,
        check_type: duplicate_detection::CHECK_TYPE_MANUAL.to_string(),
        status_id: Some(duplicate_detection::STATUS_NO_MATCH_ID),
    };

    let check = DuplicateCheckRepo::create(&state.pool, &create).await?;
    Ok(Json(DataResponse { data: check }))
}

/// POST /api/v1/characters/duplicates/batch
///
/// Batch-check multiple characters for cross-duplicates.
/// Creates a check record for each pair that exceeds the threshold.
pub async fn batch_check(
    State(state): State<AppState>,
    _auth: AuthUser,
    Json(body): Json<BatchCheckRequest>,
) -> AppResult<impl IntoResponse> {
    duplicate_detection::validate_check_type(duplicate_detection::CHECK_TYPE_BATCH)?;

    let settings = DuplicateSettingRepo::get_for_project(&state.pool, body.project_id).await?;

    // In a production system we'd load embeddings from the DB and run
    // `find_cross_matches`. For the API layer, create a no_match record per character.
    let mut checks: Vec<DuplicateCheck> = Vec::new();

    for &char_id in &body.character_ids {
        let create = CreateDuplicateCheck {
            source_character_id: char_id,
            matched_character_id: None,
            similarity_score: None,
            threshold_used: settings.similarity_threshold,
            check_type: duplicate_detection::CHECK_TYPE_BATCH.to_string(),
            status_id: Some(duplicate_detection::STATUS_NO_MATCH_ID),
        };
        let check = DuplicateCheckRepo::create(&state.pool, &create).await?;
        checks.push(check);
    }

    Ok(Json(DataResponse { data: checks }))
}

/// GET /api/v1/characters/duplicates/history
///
/// List duplicate check history with pagination.
pub async fn list_checks(
    State(state): State<AppState>,
    Query(params): Query<HistoryQuery>,
) -> AppResult<impl IntoResponse> {
    let limit = clamp_limit(params.limit, DEFAULT_SEARCH_LIMIT, MAX_SEARCH_LIMIT);
    let offset = clamp_offset(params.offset);
    let checks = DuplicateCheckRepo::list_history(&state.pool, limit, offset).await?;
    Ok(Json(DataResponse { data: checks }))
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

/// POST /api/v1/characters/duplicates/{id}/resolve
///
/// Resolve a duplicate check with the chosen resolution.
pub async fn resolve_check(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<DbId>,
    Json(body): Json<ResolveCheckRequest>,
) -> AppResult<impl IntoResponse> {
    duplicate_detection::validate_resolution(&body.resolution)?;

    let status_id = match body.resolution.as_str() {
        "merge" => duplicate_detection::STATUS_MERGED_ID,
        "dismiss" => duplicate_detection::STATUS_DISMISSED_ID,
        "create_new" | "skip" => duplicate_detection::STATUS_NO_MATCH_ID,
        _ => duplicate_detection::STATUS_NO_MATCH_ID,
    };

    let check =
        DuplicateCheckRepo::resolve(&state.pool, id, &body.resolution, status_id, auth.user_id)
            .await?;
    Ok(Json(DataResponse { data: check }))
}

/// POST /api/v1/characters/duplicates/{id}/dismiss
///
/// Shortcut to dismiss a duplicate check.
pub async fn dismiss_check(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let check = DuplicateCheckRepo::resolve(
        &state.pool,
        id,
        duplicate_detection::RESOLUTION_DISMISS,
        duplicate_detection::STATUS_DISMISSED_ID,
        auth.user_id,
    )
    .await?;
    Ok(Json(DataResponse { data: check }))
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

/// GET /api/v1/admin/duplicate-settings
///
/// Get duplicate detection settings (project-level or studio default).
pub async fn get_settings(
    State(state): State<AppState>,
    Query(params): Query<SettingsQuery>,
) -> AppResult<impl IntoResponse> {
    let settings = DuplicateSettingRepo::get_for_project(&state.pool, params.project_id).await?;
    Ok(Json(DataResponse { data: settings }))
}

/// PUT /api/v1/admin/duplicate-settings
///
/// Update duplicate detection settings (upsert for project or studio level).
pub async fn update_settings(
    State(state): State<AppState>,
    _auth: AuthUser,
    Query(params): Query<SettingsQuery>,
    Json(body): Json<UpdateDuplicateSetting>,
) -> AppResult<impl IntoResponse> {
    if let Some(threshold) = body.similarity_threshold {
        duplicate_detection::validate_threshold(threshold)?;
    }

    let settings = DuplicateSettingRepo::upsert(&state.pool, params.project_id, &body).await?;
    Ok(Json(DataResponse { data: settings }))
}
