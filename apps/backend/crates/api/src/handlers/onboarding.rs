//! Handlers for user onboarding (PRD-53).
//!
//! Provides endpoints for retrieving, updating, and resetting onboarding
//! state. All endpoints require authentication. The onboarding record is
//! created lazily on first access via `get_or_create`.

use axum::extract::State;
use axum::response::IntoResponse;
use axum::Json;

use x121_core::onboarding;
use x121_db::models::onboarding::UpdateOnboarding;
use x121_db::repositories::OnboardingRepo;

use crate::error::AppResult;
use crate::middleware::auth::AuthUser;
use crate::response::DataResponse;
use crate::state::AppState;

// ---------------------------------------------------------------------------
// GET /user/onboarding
// ---------------------------------------------------------------------------

/// Get the authenticated user's onboarding state, creating a default record
/// if this is their first access.
pub async fn get_onboarding(
    auth: AuthUser,
    State(state): State<AppState>,
) -> AppResult<impl IntoResponse> {
    let record = OnboardingRepo::get_or_create(&state.pool, auth.user_id).await?;

    tracing::debug!(user_id = auth.user_id, "Fetched onboarding state");

    Ok(Json(DataResponse { data: record }))
}

// ---------------------------------------------------------------------------
// PUT /user/onboarding
// ---------------------------------------------------------------------------

/// Partially update the authenticated user's onboarding state.
///
/// JSONB fields are merged (not replaced):
/// - `hints_dismissed_json`: new hint IDs are added to the existing array.
/// - `checklist_progress_json`: new key-value pairs are merged into the object.
/// - `feature_reveal_json`: new key-value pairs are merged into the object.
pub async fn update_onboarding(
    auth: AuthUser,
    State(state): State<AppState>,
    Json(input): Json<UpdateOnboarding>,
) -> AppResult<impl IntoResponse> {
    // Validate hint IDs if provided.
    if let Some(ref hints) = input.hints_dismissed_json {
        onboarding::validate_hint_ids(hints)?;
    }

    // Validate checklist keys if provided.
    if let Some(ref checklist) = input.checklist_progress_json {
        let keys: Vec<String> = checklist.keys().cloned().collect();
        onboarding::validate_checklist_keys(&keys)?;
    }

    // Validate feature reveal keys if provided.
    if let Some(ref features) = input.feature_reveal_json {
        let keys: Vec<String> = features.keys().cloned().collect();
        onboarding::validate_feature_keys(&keys)?;
    }

    // Ensure record exists before updating.
    OnboardingRepo::get_or_create(&state.pool, auth.user_id).await?;

    let updated = OnboardingRepo::update(&state.pool, auth.user_id, &input).await?;

    tracing::info!(user_id = auth.user_id, "Onboarding state updated");

    Ok(Json(DataResponse { data: updated }))
}

// ---------------------------------------------------------------------------
// POST /user/onboarding/reset
// ---------------------------------------------------------------------------

/// Reset all onboarding progress for the authenticated user back to defaults.
pub async fn reset_onboarding(
    auth: AuthUser,
    State(state): State<AppState>,
) -> AppResult<impl IntoResponse> {
    // Ensure record exists before resetting.
    OnboardingRepo::get_or_create(&state.pool, auth.user_id).await?;

    let reset = OnboardingRepo::reset(&state.pool, auth.user_id).await?;

    tracing::info!(user_id = auth.user_id, "Onboarding state reset");

    Ok(Json(DataResponse { data: reset }))
}
