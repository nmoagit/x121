//! Handlers for the modular layout & panel management system (PRD-30).
//!
//! Provides endpoints for user layout CRUD (authenticated users)
//! and admin layout preset management (admin only).

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use x121_core::error::CoreError;
use x121_core::types::DbId;
use x121_db::models::layout::{
    CreateAdminPreset, CreateUserLayout, UpdateAdminPreset, UpdateUserLayout,
};
use x121_db::repositories::LayoutRepo;

use crate::error::{AppError, AppResult};
use crate::middleware::rbac::{RequireAdmin, RequireAuth};
use crate::response::DataResponse;
use crate::state::AppState;

// ---------------------------------------------------------------------------
// User layout endpoints
// ---------------------------------------------------------------------------

/// GET /api/v1/user/layouts
///
/// List all layouts for the authenticated user.
pub async fn list_user_layouts(
    RequireAuth(user): RequireAuth,
    State(state): State<AppState>,
) -> AppResult<impl IntoResponse> {
    let layouts = LayoutRepo::list_user_layouts(&state.pool, user.user_id).await?;

    Ok(Json(DataResponse { data: layouts }))
}

/// POST /api/v1/user/layouts
///
/// Create a new layout for the authenticated user.
pub async fn create_user_layout(
    RequireAuth(user): RequireAuth,
    State(state): State<AppState>,
    Json(input): Json<CreateUserLayout>,
) -> AppResult<impl IntoResponse> {
    let layout = LayoutRepo::create_user_layout(&state.pool, user.user_id, &input).await?;

    tracing::info!(
        layout_id = layout.id,
        user_id = user.user_id,
        layout_name = %layout.layout_name,
        "User layout created",
    );

    Ok((StatusCode::CREATED, Json(DataResponse { data: layout })))
}

/// GET /api/v1/user/layouts/:id
///
/// Retrieve a single user layout by ID.
pub async fn get_user_layout(
    RequireAuth(_user): RequireAuth,
    State(state): State<AppState>,
    Path(layout_id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let layout = LayoutRepo::find_user_layout_by_id(&state.pool, layout_id)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "UserLayout",
            id: layout_id,
        }))?;

    Ok(Json(DataResponse { data: layout }))
}

/// PUT /api/v1/user/layouts/:id
///
/// Partially update a user layout.
pub async fn update_user_layout(
    RequireAuth(user): RequireAuth,
    State(state): State<AppState>,
    Path(layout_id): Path<DbId>,
    Json(input): Json<UpdateUserLayout>,
) -> AppResult<impl IntoResponse> {
    let layout = LayoutRepo::update_user_layout(&state.pool, layout_id, &input)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "UserLayout",
            id: layout_id,
        }))?;

    tracing::info!(layout_id, user_id = user.user_id, "User layout updated",);

    Ok(Json(DataResponse { data: layout }))
}

/// DELETE /api/v1/user/layouts/:id
///
/// Delete a user layout.
pub async fn delete_user_layout(
    RequireAuth(user): RequireAuth,
    State(state): State<AppState>,
    Path(layout_id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let deleted = LayoutRepo::delete_user_layout(&state.pool, layout_id).await?;

    if !deleted {
        return Err(AppError::Core(CoreError::NotFound {
            entity: "UserLayout",
            id: layout_id,
        }));
    }

    tracing::info!(layout_id, user_id = user.user_id, "User layout deleted",);

    Ok(StatusCode::NO_CONTENT)
}

// ---------------------------------------------------------------------------
// Admin layout preset endpoints
// ---------------------------------------------------------------------------

/// GET /api/v1/admin/layout-presets
///
/// List all admin layout presets.
pub async fn list_admin_presets(
    RequireAdmin(_admin): RequireAdmin,
    State(state): State<AppState>,
) -> AppResult<impl IntoResponse> {
    let presets = LayoutRepo::list_admin_presets(&state.pool).await?;

    Ok(Json(DataResponse { data: presets }))
}

/// POST /api/v1/admin/layout-presets
///
/// Create a new admin layout preset.
pub async fn create_admin_preset(
    RequireAdmin(admin): RequireAdmin,
    State(state): State<AppState>,
    Json(input): Json<CreateAdminPreset>,
) -> AppResult<impl IntoResponse> {
    let preset = LayoutRepo::create_admin_preset(&state.pool, &input, admin.user_id).await?;

    tracing::info!(
        preset_id = preset.id,
        name = %preset.name,
        user_id = admin.user_id,
        "Admin layout preset created",
    );

    Ok((StatusCode::CREATED, Json(DataResponse { data: preset })))
}

/// PUT /api/v1/admin/layout-presets/:id
///
/// Partially update an admin layout preset.
pub async fn update_admin_preset(
    RequireAdmin(admin): RequireAdmin,
    State(state): State<AppState>,
    Path(preset_id): Path<DbId>,
    Json(input): Json<UpdateAdminPreset>,
) -> AppResult<impl IntoResponse> {
    let preset = LayoutRepo::update_admin_preset(&state.pool, preset_id, &input)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "AdminLayoutPreset",
            id: preset_id,
        }))?;

    tracing::info!(
        preset_id,
        user_id = admin.user_id,
        "Admin layout preset updated",
    );

    Ok(Json(DataResponse { data: preset }))
}

/// DELETE /api/v1/admin/layout-presets/:id
///
/// Delete an admin layout preset.
pub async fn delete_admin_preset(
    RequireAdmin(admin): RequireAdmin,
    State(state): State<AppState>,
    Path(preset_id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let deleted = LayoutRepo::delete_admin_preset(&state.pool, preset_id).await?;

    if !deleted {
        return Err(AppError::Core(CoreError::NotFound {
            entity: "AdminLayoutPreset",
            id: preset_id,
        }));
    }

    tracing::info!(
        preset_id,
        user_id = admin.user_id,
        "Admin layout preset deleted",
    );

    Ok(StatusCode::NO_CONTENT)
}
