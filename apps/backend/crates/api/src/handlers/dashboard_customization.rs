//! Handlers for Dashboard Widget Customization (PRD-89).
//!
//! User endpoints for managing dashboard presets, preset sharing/importing,
//! and resolving effective layouts. Admin endpoints for the widget catalog
//! and role-based default layouts.

use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;

use x121_core::dashboard_customization;
use x121_core::error::CoreError;
use x121_core::types::DbId;

use x121_db::models::dashboard_customization::{
    CreateDashboardPreset, EffectiveDashboardResponse, SharePresetResponse, UpdateDashboardPreset,
    UpdateDashboardRoleDefault,
};
use x121_db::repositories::{DashboardPresetRepo, DashboardRoleDefaultRepo};

use crate::error::{AppError, AppResult};
use crate::middleware::auth::AuthUser;
use crate::middleware::rbac::RequireAdmin;
use crate::query::PaginationParams;
use crate::response::DataResponse;
use crate::state::AppState;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Look up a preset by ID, returning 404 if not found.
async fn ensure_preset_exists(
    state: &AppState,
    preset_id: DbId,
) -> AppResult<x121_db::models::dashboard_customization::DashboardPreset> {
    DashboardPresetRepo::find_by_id(&state.pool, preset_id)
        .await?
        .ok_or_else(|| {
            AppError::Core(CoreError::NotFound {
                entity: "DashboardPreset",
                id: preset_id,
            })
        })
}

/// Verify that the authenticated user owns the given preset.
fn verify_ownership(
    preset: &x121_db::models::dashboard_customization::DashboardPreset,
    user_id: DbId,
) -> AppResult<()> {
    if preset.user_id != user_id {
        return Err(AppError::Core(CoreError::Forbidden(
            "You do not own this preset".to_string(),
        )));
    }
    Ok(())
}

/// Parse and validate a layout JSON value.
///
/// Deserializes the value into `Vec<LayoutItem>` and runs
/// grid-bounds + overlap validation. Returns the parsed items on success.
fn parse_and_validate_layout(
    layout_json: &serde_json::Value,
) -> AppResult<Vec<dashboard_customization::LayoutItem>> {
    let items: Vec<dashboard_customization::LayoutItem> =
        serde_json::from_value(layout_json.clone()).map_err(|e| {
            AppError::Core(CoreError::Validation(format!("Invalid layout_json: {e}")))
        })?;
    dashboard_customization::validate_layout(&items, dashboard_customization::MAX_GRID_COLS)
        .map_err(AppError::Core)?;
    Ok(items)
}

// ===========================================================================
// User: Effective Dashboard
// ===========================================================================

/// `GET /user/dashboard/effective` -- resolve the effective layout for the user.
///
/// Priority: active preset > saved dashboard config > role default > platform default.
pub async fn get_dashboard(
    auth: AuthUser,
    State(state): State<AppState>,
) -> AppResult<impl IntoResponse> {
    // 1. Check for active preset.
    let active_preset = DashboardPresetRepo::get_active(&state.pool, auth.user_id).await?;
    let preset_layout = active_preset.as_ref().map(|p| &p.layout_json);

    // 2. Check for role default.
    let role_default = DashboardRoleDefaultRepo::find_by_role(&state.pool, &auth.role).await?;
    let role_layout = role_default.as_ref().map(|r| &r.layout_json);

    // 3. Resolve with priority chain (user_config is None here -- separate from presets).
    let effective = dashboard_customization::resolve_layout_priority(
        preset_layout,
        None, // user_config covered by the existing PRD-42 save_dashboard_config
        role_layout,
    );

    let widget_settings = active_preset
        .as_ref()
        .map(|p| p.widget_settings_json.clone())
        .unwrap_or_else(|| serde_json::json!({}));

    let source = if active_preset.is_some() {
        "preset"
    } else if role_default.is_some() {
        "role_default"
    } else {
        "platform_default"
    };

    Ok(Json(DataResponse {
        data: EffectiveDashboardResponse {
            layout: effective,
            widget_settings,
            source,
        },
    }))
}

/// `PUT /user/dashboard/layout` -- save a layout and widget settings directly.
///
/// This creates or updates the user's "default" preset.
pub async fn save_dashboard(
    auth: AuthUser,
    State(state): State<AppState>,
    Json(body): Json<CreateDashboardPreset>,
) -> AppResult<impl IntoResponse> {
    // Validate the layout before saving.
    parse_and_validate_layout(&body.layout_json)?;

    // Upsert the "My Dashboard" preset.
    let input = CreateDashboardPreset {
        name: body.name,
        layout_json: body.layout_json,
        widget_settings_json: body.widget_settings_json,
    };
    let preset = DashboardPresetRepo::create(&state.pool, auth.user_id, &input).await?;

    tracing::info!(
        user_id = auth.user_id,
        preset_id = preset.id,
        "Dashboard layout saved"
    );

    Ok(Json(DataResponse { data: preset }))
}

// ===========================================================================
// User: Preset CRUD
// ===========================================================================

/// `GET /user/dashboard/presets` -- list presets for the current user.
pub async fn list_presets(
    auth: AuthUser,
    State(state): State<AppState>,
    Query(params): Query<PaginationParams>,
) -> AppResult<impl IntoResponse> {
    let presets =
        DashboardPresetRepo::list_by_user(&state.pool, auth.user_id, params.limit, params.offset)
            .await?;
    Ok(Json(DataResponse { data: presets }))
}

/// `POST /user/dashboard/presets` -- create a new preset.
pub async fn create_preset(
    auth: AuthUser,
    State(state): State<AppState>,
    Json(body): Json<CreateDashboardPreset>,
) -> AppResult<impl IntoResponse> {
    // Validate the layout.
    parse_and_validate_layout(&body.layout_json)?;

    let preset = DashboardPresetRepo::create(&state.pool, auth.user_id, &body).await?;

    tracing::info!(
        user_id = auth.user_id,
        preset_id = preset.id,
        preset_name = %preset.name,
        "Dashboard preset created"
    );

    Ok((StatusCode::CREATED, Json(DataResponse { data: preset })))
}

/// `PUT /user/dashboard/presets/:id` -- update an existing preset.
pub async fn update_preset(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(id): Path<DbId>,
    Json(body): Json<UpdateDashboardPreset>,
) -> AppResult<impl IntoResponse> {
    let existing = ensure_preset_exists(&state, id).await?;
    verify_ownership(&existing, auth.user_id)?;

    // Validate new layout if provided.
    if let Some(ref layout_json) = body.layout_json {
        parse_and_validate_layout(layout_json)?;
    }

    let preset = DashboardPresetRepo::update(&state.pool, id, &body)
        .await?
        .ok_or_else(|| {
            AppError::Core(CoreError::NotFound {
                entity: "DashboardPreset",
                id,
            })
        })?;

    tracing::info!(
        user_id = auth.user_id,
        preset_id = id,
        "Dashboard preset updated"
    );

    Ok(Json(DataResponse { data: preset }))
}

/// `DELETE /user/dashboard/presets/:id` -- delete a preset.
pub async fn delete_preset(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(id): Path<DbId>,
) -> AppResult<StatusCode> {
    let existing = ensure_preset_exists(&state, id).await?;
    verify_ownership(&existing, auth.user_id)?;

    let deleted = DashboardPresetRepo::delete(&state.pool, id).await?;
    if deleted {
        tracing::info!(
            user_id = auth.user_id,
            preset_id = id,
            "Dashboard preset deleted"
        );
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(AppError::Core(CoreError::NotFound {
            entity: "DashboardPreset",
            id,
        }))
    }
}

/// `POST /user/dashboard/presets/:id/activate` -- set a preset as active.
pub async fn activate_preset(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let existing = ensure_preset_exists(&state, id).await?;
    verify_ownership(&existing, auth.user_id)?;

    let preset = DashboardPresetRepo::set_active(&state.pool, auth.user_id, id)
        .await?
        .ok_or_else(|| {
            AppError::Core(CoreError::NotFound {
                entity: "DashboardPreset",
                id,
            })
        })?;

    tracing::info!(
        user_id = auth.user_id,
        preset_id = id,
        "Dashboard preset activated"
    );

    Ok(Json(DataResponse { data: preset }))
}

// ===========================================================================
// User: Preset Sharing
// ===========================================================================

/// `POST /user/dashboard/presets/:id/share` -- generate a share token.
pub async fn share_preset(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let existing = ensure_preset_exists(&state, id).await?;
    verify_ownership(&existing, auth.user_id)?;

    let token = dashboard_customization::generate_share_token();
    let preset = DashboardPresetRepo::set_share_token(&state.pool, id, &token)
        .await?
        .ok_or_else(|| {
            AppError::Core(CoreError::NotFound {
                entity: "DashboardPreset",
                id,
            })
        })?;

    tracing::info!(
        user_id = auth.user_id,
        preset_id = id,
        "Dashboard preset share token generated"
    );

    Ok(Json(DataResponse {
        data: SharePresetResponse {
            share_token: preset.share_token,
            preset_id: preset.id,
        },
    }))
}

/// `POST /user/dashboard/presets/import/:share_token` -- import a shared preset.
pub async fn import_preset(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(share_token): Path<String>,
) -> AppResult<impl IntoResponse> {
    let source = DashboardPresetRepo::find_by_share_token(&state.pool, &share_token)
        .await?
        .ok_or_else(|| {
            AppError::BadRequest(format!("No preset found with share token '{share_token}'"))
        })?;

    // Create a copy for the importing user.
    let input = CreateDashboardPreset {
        name: format!("{} (imported)", source.name),
        layout_json: source.layout_json,
        widget_settings_json: Some(source.widget_settings_json),
    };
    let imported = DashboardPresetRepo::create(&state.pool, auth.user_id, &input).await?;

    tracing::info!(
        user_id = auth.user_id,
        source_preset_id = source.id,
        imported_preset_id = imported.id,
        "Dashboard preset imported via share token"
    );

    Ok((StatusCode::CREATED, Json(DataResponse { data: imported })))
}

// ===========================================================================
// Admin: Widget Catalog
// ===========================================================================

/// `GET /dashboard/widget-catalog` -- return native + extension widgets.
pub async fn get_widget_catalog(_auth: AuthUser) -> AppResult<impl IntoResponse> {
    let catalog = dashboard_customization::get_native_widget_catalog();
    Ok(Json(DataResponse { data: catalog }))
}

// ===========================================================================
// Admin: Role Defaults
// ===========================================================================

/// `GET /admin/dashboard/role-defaults` -- list all role default layouts.
pub async fn list_role_defaults(
    State(state): State<AppState>,
    RequireAdmin(_admin): RequireAdmin,
) -> AppResult<impl IntoResponse> {
    let defaults = DashboardRoleDefaultRepo::list_all(&state.pool).await?;
    Ok(Json(DataResponse { data: defaults }))
}

/// `PUT /admin/dashboard/role-defaults/:role` -- update a role default layout.
pub async fn update_role_default(
    State(state): State<AppState>,
    RequireAdmin(admin): RequireAdmin,
    Path(role): Path<String>,
    Json(body): Json<UpdateDashboardRoleDefault>,
) -> AppResult<impl IntoResponse> {
    // Validate the layout.
    parse_and_validate_layout(&body.layout_json)?;

    let role_default = DashboardRoleDefaultRepo::upsert(
        &state.pool,
        &role,
        &body.layout_json,
        body.widget_settings_json.as_ref(),
        Some(admin.user_id),
    )
    .await?;

    tracing::info!(
        admin_id = admin.user_id,
        role = %role,
        "Dashboard role default updated"
    );

    Ok(Json(DataResponse { data: role_default }))
}
