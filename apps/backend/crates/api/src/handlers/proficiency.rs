//! Handlers for user proficiency and focus mode (PRD-32).
//!
//! All endpoints require authentication via [`RequireAuth`].

use axum::extract::State;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use serde::Deserialize;
use x121_db::models::proficiency::{SetFocusMode, SetProficiency};
use x121_db::repositories::ProficiencyRepo;

use crate::error::AppResult;
use crate::middleware::rbac::RequireAuth;
use crate::response::DataResponse;
use crate::state::AppState;

// ---------------------------------------------------------------------------
// Request DTOs
// ---------------------------------------------------------------------------

/// DTO for recording a feature usage event.
#[derive(Debug, Deserialize)]
pub struct RecordUsageRequest {
    pub feature_area: String,
}

// ---------------------------------------------------------------------------
// Proficiency endpoints
// ---------------------------------------------------------------------------

/// GET /api/v1/user/proficiency
///
/// List all proficiency records for the authenticated user.
pub async fn get_proficiency(
    RequireAuth(user): RequireAuth,
    State(state): State<AppState>,
) -> AppResult<impl IntoResponse> {
    let proficiencies = ProficiencyRepo::get_all_proficiency(&state.pool, user.user_id).await?;

    Ok(Json(DataResponse {
        data: proficiencies,
    }))
}

/// PUT /api/v1/user/proficiency
///
/// Manually set a proficiency level for a feature area (sets manual_override = true).
pub async fn set_proficiency(
    RequireAuth(user): RequireAuth,
    State(state): State<AppState>,
    Json(input): Json<SetProficiency>,
) -> AppResult<impl IntoResponse> {
    let proficiency = ProficiencyRepo::set_proficiency(
        &state.pool,
        user.user_id,
        &input.feature_area,
        &input.proficiency_level,
    )
    .await?;

    tracing::info!(
        user_id = user.user_id,
        feature_area = %input.feature_area,
        level = %input.proficiency_level,
        "User proficiency manually set",
    );

    Ok(Json(DataResponse { data: proficiency }))
}

/// POST /api/v1/user/proficiency/record-usage
///
/// Record a feature usage event. Auto-promotes proficiency level at thresholds
/// unless the user has a manual override.
pub async fn record_usage(
    RequireAuth(user): RequireAuth,
    State(state): State<AppState>,
    Json(input): Json<RecordUsageRequest>,
) -> AppResult<impl IntoResponse> {
    let proficiency =
        ProficiencyRepo::record_feature_usage(&state.pool, user.user_id, &input.feature_area)
            .await?;

    Ok(Json(DataResponse { data: proficiency }))
}

// ---------------------------------------------------------------------------
// Focus mode endpoints
// ---------------------------------------------------------------------------

/// GET /api/v1/user/proficiency/focus-mode
///
/// Get the authenticated user's current focus mode.
/// Returns 204 if no focus preference has been saved.
pub async fn get_focus_mode(
    RequireAuth(user): RequireAuth,
    State(state): State<AppState>,
) -> AppResult<impl IntoResponse> {
    let pref = ProficiencyRepo::get_focus_preference(&state.pool, user.user_id).await?;

    match pref {
        Some(p) => Ok(Json(DataResponse { data: p }).into_response()),
        None => Ok(StatusCode::NO_CONTENT.into_response()),
    }
}

/// PUT /api/v1/user/proficiency/focus-mode
///
/// Set (upsert) the authenticated user's focus mode.
pub async fn set_focus_mode(
    RequireAuth(user): RequireAuth,
    State(state): State<AppState>,
    Json(input): Json<SetFocusMode>,
) -> AppResult<impl IntoResponse> {
    let pref = ProficiencyRepo::set_focus_preference(
        &state.pool,
        user.user_id,
        input.focus_mode.as_deref(),
    )
    .await?;

    tracing::info!(
        user_id = user.user_id,
        focus_mode = ?input.focus_mode,
        "User focus mode updated",
    );

    Ok(Json(DataResponse { data: pref }))
}
