//! Handlers for the theme system (PRD-29).
//!
//! Provides endpoints for user theme preferences (authenticated users)
//! and custom theme management (admin only).

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use x121_core::error::CoreError;
use x121_core::types::DbId;
use x121_db::models::theme::{CreateCustomTheme, UpdateCustomTheme, UpsertThemePreference};
use x121_db::repositories::ThemeRepo;

use crate::error::{AppError, AppResult};
use crate::middleware::rbac::{RequireAdmin, RequireAuth};
use crate::response::DataResponse;
use crate::state::AppState;

// ---------------------------------------------------------------------------
// User theme preference endpoints
// ---------------------------------------------------------------------------

/// GET /api/v1/user/theme
///
/// Retrieve the authenticated user's theme preference.
/// Returns 204 if no preference has been saved yet.
pub async fn get_user_theme(
    RequireAuth(user): RequireAuth,
    State(state): State<AppState>,
) -> AppResult<impl IntoResponse> {
    let pref = ThemeRepo::get_user_preference(&state.pool, user.user_id).await?;

    match pref {
        Some(p) => Ok(Json(DataResponse { data: p }).into_response()),
        None => Ok(StatusCode::NO_CONTENT.into_response()),
    }
}

/// PUT /api/v1/user/theme
///
/// Create or update the authenticated user's theme preference.
pub async fn update_user_theme(
    RequireAuth(user): RequireAuth,
    State(state): State<AppState>,
    Json(input): Json<UpsertThemePreference>,
) -> AppResult<impl IntoResponse> {
    let pref = ThemeRepo::upsert_user_preference(&state.pool, user.user_id, &input).await?;

    tracing::info!(
        user_id = user.user_id,
        color_scheme = %input.color_scheme,
        brand_palette = %input.brand_palette,
        "User theme preference updated",
    );

    Ok(Json(DataResponse { data: pref }))
}

// ---------------------------------------------------------------------------
// Admin custom theme endpoints
// ---------------------------------------------------------------------------

/// GET /api/v1/admin/themes
///
/// List all active custom themes.
pub async fn list_custom_themes(
    RequireAdmin(_admin): RequireAdmin,
    State(state): State<AppState>,
) -> AppResult<impl IntoResponse> {
    let themes = ThemeRepo::list_custom_themes(&state.pool).await?;

    Ok(Json(DataResponse { data: themes }))
}

/// POST /api/v1/admin/themes
///
/// Create a new custom theme.
pub async fn create_custom_theme(
    RequireAdmin(admin): RequireAdmin,
    State(state): State<AppState>,
    Json(input): Json<CreateCustomTheme>,
) -> AppResult<impl IntoResponse> {
    let theme = ThemeRepo::create_custom_theme(&state.pool, &input, admin.user_id).await?;

    tracing::info!(
        theme_id = theme.id,
        name = %theme.name,
        user_id = admin.user_id,
        "Custom theme created",
    );

    Ok((StatusCode::CREATED, Json(DataResponse { data: theme })))
}

/// GET /api/v1/admin/themes/:id
///
/// Retrieve a single custom theme by ID.
pub async fn get_custom_theme(
    RequireAdmin(_admin): RequireAdmin,
    State(state): State<AppState>,
    Path(theme_id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let theme = ThemeRepo::find_custom_theme_by_id(&state.pool, theme_id)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "CustomTheme",
            id: theme_id,
        }))?;

    Ok(Json(DataResponse { data: theme }))
}

/// PUT /api/v1/admin/themes/:id
///
/// Partially update a custom theme.
pub async fn update_custom_theme(
    RequireAdmin(admin): RequireAdmin,
    State(state): State<AppState>,
    Path(theme_id): Path<DbId>,
    Json(input): Json<UpdateCustomTheme>,
) -> AppResult<impl IntoResponse> {
    let theme = ThemeRepo::update_custom_theme(&state.pool, theme_id, &input)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "CustomTheme",
            id: theme_id,
        }))?;

    tracing::info!(theme_id, user_id = admin.user_id, "Custom theme updated",);

    Ok(Json(DataResponse { data: theme }))
}

/// DELETE /api/v1/admin/themes/:id
///
/// Delete a custom theme.
pub async fn delete_custom_theme(
    RequireAdmin(admin): RequireAdmin,
    State(state): State<AppState>,
    Path(theme_id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let deleted = ThemeRepo::delete_custom_theme(&state.pool, theme_id).await?;

    if !deleted {
        return Err(AppError::Core(CoreError::NotFound {
            entity: "CustomTheme",
            id: theme_id,
        }));
    }

    tracing::info!(theme_id, user_id = admin.user_id, "Custom theme deleted",);

    Ok(StatusCode::NO_CONTENT)
}

/// GET /api/v1/admin/themes/:id/export
///
/// Export a custom theme's token set as raw JSON.
pub async fn export_custom_theme(
    RequireAdmin(_admin): RequireAdmin,
    State(state): State<AppState>,
    Path(theme_id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let tokens = ThemeRepo::export_custom_theme(&state.pool, theme_id)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "CustomTheme",
            id: theme_id,
        }))?;

    Ok(Json(DataResponse { data: tokens }))
}
