//! Admin handlers for API key management (PRD-12).
//!
//! All endpoints require the admin role via [`RequireAdmin`].
//! The plaintext key is returned **only** on creation; subsequent queries
//! expose only the `key_prefix` for identification.

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use trulience_core::api_keys::{
    generate_api_key, DEFAULT_RATE_LIMIT_READ, DEFAULT_RATE_LIMIT_WRITE,
};
use trulience_core::error::CoreError;
use trulience_core::types::DbId;
use trulience_db::models::api_key::{ApiKeyCreatedResponse, CreateApiKey, UpdateApiKey};
use trulience_db::repositories::ApiKeyRepo;

use crate::error::{AppError, AppResult};
use crate::middleware::rbac::RequireAdmin;
use crate::response::DataResponse;
use crate::state::AppState;

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/// POST /api/v1/admin/api-keys
///
/// Generate a new API key. The plaintext key is returned exactly once.
pub async fn create_api_key(
    RequireAdmin(admin): RequireAdmin,
    State(state): State<AppState>,
    Json(input): Json<CreateApiKey>,
) -> AppResult<impl IntoResponse> {
    if input.name.trim().is_empty() {
        return Err(AppError::BadRequest("name must not be empty".into()));
    }

    // Resolve scope
    let scope = ApiKeyRepo::find_scope_by_name(&state.pool, &input.scope)
        .await?
        .ok_or_else(|| {
            AppError::BadRequest(format!("Unknown scope: '{}'", input.scope))
        })?;

    // Generate key material
    let generated = generate_api_key();

    let rate_read = input.rate_limit_read_per_min.unwrap_or(DEFAULT_RATE_LIMIT_READ);
    let rate_write = input.rate_limit_write_per_min.unwrap_or(DEFAULT_RATE_LIMIT_WRITE);

    let key = ApiKeyRepo::create(
        &state.pool,
        input.name.trim(),
        input.description.as_deref(),
        &generated.hash,
        &generated.prefix,
        scope.id,
        input.project_id,
        admin.user_id,
        rate_read,
        rate_write,
        input.expires_at.as_deref(),
    )
    .await?;

    tracing::info!(
        api_key_id = key.id,
        key_prefix = %generated.prefix,
        scope = %input.scope,
        user_id = admin.user_id,
        "API key created",
    );

    let response = ApiKeyCreatedResponse {
        id: key.id,
        name: key.name,
        key_prefix: generated.prefix,
        plaintext_key: generated.plaintext,
        scope_name: input.scope,
        project_id: key.project_id,
        created_at: key.created_at,
    };

    Ok((StatusCode::CREATED, Json(DataResponse { data: response })))
}

/// GET /api/v1/admin/api-keys
///
/// List all API keys. Shows prefix only, never the full key.
pub async fn list_api_keys(
    _admin: RequireAdmin,
    State(state): State<AppState>,
) -> AppResult<impl IntoResponse> {
    let keys = ApiKeyRepo::list(&state.pool).await?;
    Ok(Json(DataResponse { data: keys }))
}

/// PUT /api/v1/admin/api-keys/{id}
///
/// Update API key settings (name, description, rate limits, active status).
pub async fn update_api_key(
    RequireAdmin(admin): RequireAdmin,
    State(state): State<AppState>,
    Path(key_id): Path<DbId>,
    Json(input): Json<UpdateApiKey>,
) -> AppResult<impl IntoResponse> {
    let updated = ApiKeyRepo::update(
        &state.pool,
        key_id,
        input.name.as_deref(),
        input.description.as_deref(),
        input.rate_limit_read_per_min,
        input.rate_limit_write_per_min,
        input.is_active,
    )
    .await?
    .ok_or(AppError::Core(CoreError::NotFound {
        entity: "ApiKey",
        id: key_id,
    }))?;

    tracing::info!(
        api_key_id = key_id,
        user_id = admin.user_id,
        "API key updated",
    );

    Ok(Json(DataResponse { data: updated }))
}

/// POST /api/v1/admin/api-keys/{id}/rotate
///
/// Rotate an API key: generate a new key, replace hash and prefix.
/// Returns the new plaintext key (shown once).
pub async fn rotate_api_key(
    RequireAdmin(admin): RequireAdmin,
    State(state): State<AppState>,
    Path(key_id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    // Verify key exists
    let existing = ApiKeyRepo::find_by_id(&state.pool, key_id)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "ApiKey",
            id: key_id,
        }))?;

    let generated = generate_api_key();

    let rotated = ApiKeyRepo::rotate(
        &state.pool,
        key_id,
        &generated.hash,
        &generated.prefix,
    )
    .await?
    .ok_or(AppError::Core(CoreError::NotFound {
        entity: "ApiKey",
        id: key_id,
    }))?;

    tracing::info!(
        api_key_id = key_id,
        old_prefix = %existing.key_prefix,
        new_prefix = %generated.prefix,
        user_id = admin.user_id,
        "API key rotated",
    );

    let response = ApiKeyCreatedResponse {
        id: rotated.id,
        name: rotated.name,
        key_prefix: generated.prefix,
        plaintext_key: generated.plaintext,
        scope_name: String::new(), // Caller already knows the scope
        project_id: rotated.project_id,
        created_at: rotated.created_at,
    };

    Ok(Json(DataResponse { data: response }))
}

/// POST /api/v1/admin/api-keys/{id}/revoke
///
/// Instantly revoke an API key. Sets `revoked_at` and `is_active = false`.
pub async fn revoke_api_key(
    RequireAdmin(admin): RequireAdmin,
    State(state): State<AppState>,
    Path(key_id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let revoked = ApiKeyRepo::revoke(&state.pool, key_id)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "ApiKey",
            id: key_id,
        }))?;

    tracing::info!(
        api_key_id = key_id,
        key_prefix = %revoked.key_prefix,
        user_id = admin.user_id,
        "API key revoked",
    );

    Ok(Json(DataResponse { data: revoked }))
}

/// GET /api/v1/admin/api-keys/scopes
///
/// List all available API key scopes.
pub async fn list_scopes(
    _admin: RequireAdmin,
    State(state): State<AppState>,
) -> AppResult<impl IntoResponse> {
    let scopes = ApiKeyRepo::list_scopes(&state.pool).await?;
    Ok(Json(DataResponse { data: scopes }))
}
