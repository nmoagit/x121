//! Handlers for the extension system (PRD-85).
//!
//! Provides admin endpoints for extension lifecycle management (install,
//! uninstall, enable/disable, settings) and authenticated endpoints for
//! the extension registry and sandboxed API bridge.

use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use serde::Deserialize;
use x121_core::error::CoreError;
use x121_core::extensions::{self, ExtensionManifest};
use x121_core::types::DbId;
use x121_db::models::extension::{CreateExtension, UpdateExtensionSettings};
use x121_db::repositories::{CharacterRepo, ExtensionRepo, ProjectRepo};

use crate::error::{AppError, AppResult};
use crate::middleware::auth::AuthUser;
use crate::middleware::rbac::RequireAdmin;
use crate::response::DataResponse;
use crate::state::AppState;

// ---------------------------------------------------------------------------
// Request DTOs
// ---------------------------------------------------------------------------

/// Body for `POST /admin/extensions` (install).
#[derive(Debug, Deserialize)]
pub struct InstallExtensionRequest {
    pub name: String,
    pub version: String,
    pub author: Option<String>,
    pub description: Option<String>,
    pub manifest_json: serde_json::Value,
    pub source_path: String,
    pub api_version: String,
}

/// Query parameters for extension API bridge endpoints.
#[derive(Debug, Deserialize)]
pub struct ExtApiParams {
    pub extension_id: DbId,
}

// ---------------------------------------------------------------------------
// Admin management endpoints
// ---------------------------------------------------------------------------

/// GET /api/v1/admin/extensions
///
/// List all installed extensions (enabled and disabled).
pub async fn list_extensions(
    RequireAdmin(_admin): RequireAdmin,
    State(state): State<AppState>,
) -> AppResult<impl IntoResponse> {
    let extensions = ExtensionRepo::list_all(&state.pool).await?;

    Ok(Json(DataResponse { data: extensions }))
}

/// POST /api/v1/admin/extensions
///
/// Install a new extension. Validates the manifest before persisting.
pub async fn install_extension(
    RequireAdmin(admin): RequireAdmin,
    State(state): State<AppState>,
    Json(body): Json<InstallExtensionRequest>,
) -> AppResult<impl IntoResponse> {
    // Parse and validate the manifest.
    let manifest: ExtensionManifest = serde_json::from_value(body.manifest_json.clone())
        .map_err(|e| AppError::BadRequest(format!("Invalid manifest_json: {e}")))?;
    extensions::validate_manifest(&manifest)?;

    let create = CreateExtension {
        name: body.name,
        version: body.version,
        author: body.author,
        description: body.description,
        manifest_json: body.manifest_json,
        settings_json: None,
        source_path: body.source_path,
        api_version: body.api_version,
        installed_by: Some(admin.user_id),
    };

    let extension = ExtensionRepo::insert(&state.pool, &create).await?;

    tracing::info!(
        extension_id = extension.id,
        extension_name = %extension.name,
        user_id = admin.user_id,
        "Extension installed",
    );

    Ok((StatusCode::CREATED, Json(DataResponse { data: extension })))
}

/// GET /api/v1/admin/extensions/{id}
///
/// Get a single extension by ID.
pub async fn get_extension(
    RequireAdmin(_admin): RequireAdmin,
    State(state): State<AppState>,
    Path(id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let extension = ExtensionRepo::find_by_id(&state.pool, id)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "Extension",
            id,
        }))?;

    Ok(Json(DataResponse { data: extension }))
}

/// PUT /api/v1/admin/extensions/{id}
///
/// Update an extension's settings JSON.
pub async fn update_extension_settings(
    RequireAdmin(admin): RequireAdmin,
    State(state): State<AppState>,
    Path(id): Path<DbId>,
    Json(body): Json<UpdateExtensionSettings>,
) -> AppResult<impl IntoResponse> {
    let extension = ExtensionRepo::update_settings(&state.pool, id, &body)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "Extension",
            id,
        }))?;

    tracing::info!(
        extension_id = id,
        user_id = admin.user_id,
        "Extension settings updated",
    );

    Ok(Json(DataResponse { data: extension }))
}

/// DELETE /api/v1/admin/extensions/{id}
///
/// Uninstall (delete) an extension.
pub async fn uninstall_extension(
    RequireAdmin(admin): RequireAdmin,
    State(state): State<AppState>,
    Path(id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let deleted = ExtensionRepo::delete(&state.pool, id).await?;

    if !deleted {
        return Err(AppError::Core(CoreError::NotFound {
            entity: "Extension",
            id,
        }));
    }

    tracing::info!(
        extension_id = id,
        user_id = admin.user_id,
        "Extension uninstalled",
    );

    Ok(StatusCode::NO_CONTENT)
}

/// POST /api/v1/admin/extensions/{id}/enable
///
/// Enable an extension.
pub async fn enable_extension(
    RequireAdmin(admin): RequireAdmin,
    State(state): State<AppState>,
    Path(id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    toggle_extension(&state, id, admin.user_id, true).await
}

/// POST /api/v1/admin/extensions/{id}/disable
///
/// Disable an extension.
pub async fn disable_extension(
    RequireAdmin(admin): RequireAdmin,
    State(state): State<AppState>,
    Path(id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    toggle_extension(&state, id, admin.user_id, false).await
}

/// Shared implementation for enable/disable handlers.
async fn toggle_extension(
    state: &AppState,
    id: DbId,
    user_id: DbId,
    enabled: bool,
) -> AppResult<impl IntoResponse> {
    let extension = ExtensionRepo::set_enabled(&state.pool, id, enabled)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "Extension",
            id,
        }))?;

    let action = if enabled { "enabled" } else { "disabled" };
    tracing::info!(extension_id = id, user_id, "Extension {action}",);

    Ok(Json(DataResponse { data: extension }))
}

// ---------------------------------------------------------------------------
// Registry endpoint
// ---------------------------------------------------------------------------

/// GET /api/v1/extensions/registry
///
/// Returns lightweight registration data for all enabled extensions.
/// Requires authentication but not admin role.
pub async fn get_registry(
    _auth: AuthUser,
    State(state): State<AppState>,
) -> AppResult<impl IntoResponse> {
    let registry = ExtensionRepo::list_registry(&state.pool).await?;

    Ok(Json(DataResponse { data: registry }))
}

// ---------------------------------------------------------------------------
// Extension API bridge endpoints
// ---------------------------------------------------------------------------

/// GET /api/v1/extension-api/projects
///
/// Sandboxed proxy: list projects on behalf of an extension.
/// The extension must be enabled and have `projects:read` permission.
pub async fn ext_api_list_projects(
    _auth: AuthUser,
    State(state): State<AppState>,
    Query(params): Query<ExtApiParams>,
) -> AppResult<impl IntoResponse> {
    ensure_extension_permitted(&state, params.extension_id, "projects", "read").await?;

    let projects = ProjectRepo::list(&state.pool).await?;

    Ok(Json(DataResponse { data: projects }))
}

/// GET /api/v1/extension-api/characters/{id}
///
/// Sandboxed proxy: get a character on behalf of an extension.
/// The extension must be enabled and have `characters:read` permission.
pub async fn ext_api_get_character(
    _auth: AuthUser,
    State(state): State<AppState>,
    Path(id): Path<DbId>,
    Query(params): Query<ExtApiParams>,
) -> AppResult<impl IntoResponse> {
    ensure_extension_permitted(&state, params.extension_id, "characters", "read").await?;

    let character = CharacterRepo::find_by_id(&state.pool, id)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "Character",
            id,
        }))?;

    Ok(Json(DataResponse { data: character }))
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Verify that an extension exists, is enabled, and has the required permission.
///
/// Returns the extension on success, or an appropriate error:
/// - 404 if the extension does not exist
/// - 403 if the extension is disabled or lacks the required permission
async fn ensure_extension_permitted(
    state: &AppState,
    extension_id: DbId,
    resource: &str,
    access: &str,
) -> AppResult<()> {
    let extension = ExtensionRepo::find_by_id(&state.pool, extension_id)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "Extension",
            id: extension_id,
        }))?;

    if !extension.enabled {
        return Err(AppError::Core(CoreError::Forbidden(format!(
            "Extension '{}' is not enabled",
            extension.name
        ))));
    }

    // Parse the stored manifest to check permissions.
    let manifest: ExtensionManifest =
        serde_json::from_value(extension.manifest_json).map_err(|e| {
            AppError::InternalError(format!(
                "Failed to parse manifest for extension '{}': {e}",
                extension.name,
            ))
        })?;

    let has_permission = manifest
        .permissions
        .iter()
        .any(|p| p.resource == resource && p.access == access);

    if !has_permission {
        return Err(AppError::Core(CoreError::Forbidden(format!(
            "Extension '{}' does not have {resource}:{access} permission",
            extension.name,
        ))));
    }

    Ok(())
}
