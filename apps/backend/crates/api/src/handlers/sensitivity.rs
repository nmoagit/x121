//! Handlers for content sensitivity controls (PRD-82).
//!
//! Provides endpoints for user sensitivity preferences (authenticated users)
//! and studio-wide minimum sensitivity config (admin only).

use axum::extract::State;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use x121_db::models::sensitivity::{UpsertSensitivitySettings, UpsertStudioSensitivityConfig};
use x121_db::repositories::SensitivityRepo;

use crate::error::AppResult;
use crate::middleware::rbac::{RequireAdmin, RequireAuth};
use crate::response::DataResponse;
use crate::state::AppState;

// ---------------------------------------------------------------------------
// User sensitivity endpoints
// ---------------------------------------------------------------------------

/// GET /api/v1/user/sensitivity
///
/// Retrieve the authenticated user's sensitivity settings.
/// Returns 204 if no settings have been saved yet.
pub async fn get_user_sensitivity(
    RequireAuth(user): RequireAuth,
    State(state): State<AppState>,
) -> AppResult<impl IntoResponse> {
    let settings = SensitivityRepo::get_user_settings(&state.pool, user.user_id).await?;

    match settings {
        Some(s) => Ok(Json(DataResponse { data: s }).into_response()),
        None => Ok(StatusCode::NO_CONTENT.into_response()),
    }
}

/// PUT /api/v1/user/sensitivity
///
/// Create or update the authenticated user's sensitivity settings.
/// The `global_level` is clamped to the studio-wide minimum floor
/// before persisting.
pub async fn update_user_sensitivity(
    RequireAuth(user): RequireAuth,
    State(state): State<AppState>,
    Json(mut input): Json<UpsertSensitivitySettings>,
) -> AppResult<impl IntoResponse> {
    // Enforce the studio-wide minimum sensitivity floor.
    let studio_config = SensitivityRepo::get_studio_config(&state.pool).await?;
    let min_level = studio_config
        .map(|c| c.min_level)
        .unwrap_or_else(|| "full".to_string());
    let effective_level =
        x121_core::sensitivity::enforce_minimum_level(&input.global_level, &min_level);
    input.global_level = effective_level;

    let settings = SensitivityRepo::upsert_user_settings(&state.pool, user.user_id, &input).await?;

    tracing::info!(
        user_id = user.user_id,
        global_level = %settings.global_level,
        "User sensitivity settings updated",
    );

    Ok(Json(DataResponse { data: settings }))
}

// ---------------------------------------------------------------------------
// Admin sensitivity defaults endpoints
// ---------------------------------------------------------------------------

/// GET /api/v1/admin/sensitivity-defaults
///
/// Retrieve the current studio-wide minimum sensitivity config.
/// Returns 204 if no config has been set.
pub async fn get_admin_sensitivity_defaults(
    RequireAdmin(_admin): RequireAdmin,
    State(state): State<AppState>,
) -> AppResult<impl IntoResponse> {
    let config = SensitivityRepo::get_studio_config(&state.pool).await?;

    match config {
        Some(c) => Ok(Json(DataResponse { data: c }).into_response()),
        None => Ok(StatusCode::NO_CONTENT.into_response()),
    }
}

/// PUT /api/v1/admin/sensitivity-defaults
///
/// Create or update the studio-wide minimum sensitivity config.
pub async fn update_admin_sensitivity_defaults(
    RequireAdmin(admin): RequireAdmin,
    State(state): State<AppState>,
    Json(input): Json<UpsertStudioSensitivityConfig>,
) -> AppResult<impl IntoResponse> {
    let config = SensitivityRepo::upsert_studio_config(&state.pool, &input, admin.user_id).await?;

    tracing::info!(
        user_id = admin.user_id,
        min_level = %config.min_level,
        "Studio sensitivity defaults updated",
    );

    Ok(Json(DataResponse { data: config }))
}
