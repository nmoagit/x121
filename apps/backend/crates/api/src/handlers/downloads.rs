//! Handlers for the Model & LoRA Download Manager (PRD-104).
//!
//! Provides endpoints for managing model downloads, placement rules,
//! and user API tokens for external services (CivitAI, HuggingFace).

use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use serde::Deserialize;

use x121_core::download_manager;
use x121_core::error::CoreError;
use x121_core::search::{clamp_limit, clamp_offset, DEFAULT_SEARCH_LIMIT, MAX_SEARCH_LIMIT};
use x121_core::types::DbId;
use x121_db::models::model_download::{
    CreateDownloadRequest, CreateModelDownload, DownloadCreatedResponse, ModelDownload,
};
use x121_db::models::placement_rule::{CreatePlacementRule, PlacementRule, UpdatePlacementRule};
use x121_db::models::status::DownloadStatus;
use x121_db::models::user_api_token::{ApiTokenInfo, StoreTokenRequest};
use x121_db::repositories::{ModelDownloadRepo, PlacementRuleRepo, UserApiTokenRepo};

use crate::error::{AppError, AppResult};
use crate::middleware::auth::AuthUser;
use crate::middleware::rbac::RequireAdmin;
use crate::response::DataResponse;
use crate::state::AppState;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Verify that a model download exists, returning the full row.
async fn ensure_download_exists(pool: &sqlx::PgPool, id: DbId) -> AppResult<ModelDownload> {
    ModelDownloadRepo::find_by_id(pool, id)
        .await?
        .ok_or_else(|| {
            AppError::Core(CoreError::NotFound {
                entity: "ModelDownload",
                id,
            })
        })
}

/// Verify that a placement rule exists, returning the full row.
async fn ensure_rule_exists(pool: &sqlx::PgPool, id: DbId) -> AppResult<PlacementRule> {
    PlacementRuleRepo::find_by_id(pool, id)
        .await?
        .ok_or_else(|| {
            AppError::Core(CoreError::NotFound {
                entity: "PlacementRule",
                id,
            })
        })
}

// ---------------------------------------------------------------------------
// Download list/create query params
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
pub struct ListDownloadsQuery {
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

// ===========================================================================
// Download endpoints
// ===========================================================================

// ---------------------------------------------------------------------------
// GET /downloads
// ---------------------------------------------------------------------------

/// List all downloads, ordered by creation time descending.
pub async fn list_downloads(
    _user: AuthUser,
    State(state): State<AppState>,
    Query(params): Query<ListDownloadsQuery>,
) -> AppResult<impl IntoResponse> {
    let limit = clamp_limit(params.limit, DEFAULT_SEARCH_LIMIT, MAX_SEARCH_LIMIT);
    let offset = clamp_offset(params.offset);
    let downloads = ModelDownloadRepo::list_all(&state.pool, limit, offset).await?;
    Ok(Json(DataResponse { data: downloads }))
}

// ---------------------------------------------------------------------------
// POST /downloads
// ---------------------------------------------------------------------------

/// Enqueue a new model download from a URL.
pub async fn create_download(
    user: AuthUser,
    State(state): State<AppState>,
    Json(input): Json<CreateDownloadRequest>,
) -> AppResult<impl IntoResponse> {
    download_manager::validate_download_url(&input.url)?;

    let source_type = download_manager::detect_source_type(&input.url);
    let file_name = download_manager::extract_filename_from_url(&input.url);
    let model_name = input.model_name.unwrap_or_else(|| file_name.clone());
    let model_type = input
        .model_type
        .unwrap_or_else(|| download_manager::MODEL_TYPE_CHECKPOINT.to_string());

    download_manager::validate_model_type(&model_type)?;

    // Resolve target path using placement rules.
    let target_path = PlacementRuleRepo::resolve_path(&state.pool, &model_type, None).await?;

    let create_input = CreateModelDownload {
        source_type: source_type.to_string(),
        source_url: input.url,
        source_model_id: None,
        source_version_id: None,
        model_name,
        model_type,
        base_model: None,
        file_name,
        file_size_bytes: None,
        target_path: Some(target_path),
        expected_hash: None,
        source_metadata: None,
        initiated_by: Some(user.user_id),
    };

    let download = ModelDownloadRepo::create(&state.pool, &create_input).await?;

    tracing::info!(
        download_id = download.id,
        source_type = %download.source_type,
        model_name = %download.model_name,
        user_id = user.user_id,
        "Model download enqueued",
    );

    let response = DownloadCreatedResponse {
        download_id: download.id,
        status: download_manager::DL_STATUS_QUEUED.to_string(),
    };

    Ok((StatusCode::CREATED, Json(DataResponse { data: response })))
}

// ---------------------------------------------------------------------------
// GET /downloads/{id}
// ---------------------------------------------------------------------------

/// Get a single download by ID.
pub async fn get_download(
    _user: AuthUser,
    State(state): State<AppState>,
    Path(id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let download = ensure_download_exists(&state.pool, id).await?;
    Ok(Json(DataResponse { data: download }))
}

// ---------------------------------------------------------------------------
// POST /downloads/{id}/pause
// ---------------------------------------------------------------------------

/// Pause an active download.
pub async fn pause_download(
    user: AuthUser,
    State(state): State<AppState>,
    Path(id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let download = ensure_download_exists(&state.pool, id).await?;

    if download.status_id != DownloadStatus::Downloading.id() {
        return Err(AppError::BadRequest(
            "Can only pause downloads that are currently downloading".to_string(),
        ));
    }

    ModelDownloadRepo::update_status(&state.pool, id, DownloadStatus::Paused.id()).await?;

    tracing::info!(download_id = id, user_id = user.user_id, "Download paused");

    let updated = ensure_download_exists(&state.pool, id).await?;
    Ok(Json(DataResponse { data: updated }))
}

// ---------------------------------------------------------------------------
// POST /downloads/{id}/resume
// ---------------------------------------------------------------------------

/// Resume a paused download.
pub async fn resume_download(
    user: AuthUser,
    State(state): State<AppState>,
    Path(id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let download = ensure_download_exists(&state.pool, id).await?;

    if download.status_id != DownloadStatus::Paused.id() {
        return Err(AppError::BadRequest(
            "Can only resume downloads that are paused".to_string(),
        ));
    }

    ModelDownloadRepo::update_status(&state.pool, id, DownloadStatus::Queued.id()).await?;

    tracing::info!(download_id = id, user_id = user.user_id, "Download resumed");

    let updated = ensure_download_exists(&state.pool, id).await?;
    Ok(Json(DataResponse { data: updated }))
}

// ---------------------------------------------------------------------------
// POST /downloads/{id}/cancel
// ---------------------------------------------------------------------------

/// Cancel an active or queued download.
pub async fn cancel_download(
    user: AuthUser,
    State(state): State<AppState>,
    Path(id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let download = ensure_download_exists(&state.pool, id).await?;

    let cancellable = [
        DownloadStatus::Queued.id(),
        DownloadStatus::Downloading.id(),
        DownloadStatus::Paused.id(),
    ];
    if !cancellable.contains(&download.status_id) {
        return Err(AppError::BadRequest(
            "Can only cancel queued, downloading, or paused downloads".to_string(),
        ));
    }

    ModelDownloadRepo::update_status(&state.pool, id, DownloadStatus::Cancelled.id()).await?;

    tracing::info!(
        download_id = id,
        user_id = user.user_id,
        "Download cancelled",
    );

    let updated = ensure_download_exists(&state.pool, id).await?;
    Ok(Json(DataResponse { data: updated }))
}

// ---------------------------------------------------------------------------
// POST /downloads/{id}/retry
// ---------------------------------------------------------------------------

/// Retry a failed or cancelled download.
pub async fn retry_download(
    user: AuthUser,
    State(state): State<AppState>,
    Path(id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let download = ensure_download_exists(&state.pool, id).await?;

    let retryable = [DownloadStatus::Failed.id(), DownloadStatus::Cancelled.id()];
    if !retryable.contains(&download.status_id) {
        return Err(AppError::BadRequest(
            "Can only retry failed or cancelled downloads".to_string(),
        ));
    }

    ModelDownloadRepo::update_status(&state.pool, id, DownloadStatus::Queued.id()).await?;

    tracing::info!(download_id = id, user_id = user.user_id, "Download retried",);

    let updated = ensure_download_exists(&state.pool, id).await?;
    Ok(Json(DataResponse { data: updated }))
}

// ===========================================================================
// Placement rule endpoints
// ===========================================================================

// ---------------------------------------------------------------------------
// GET /admin/placement-rules
// ---------------------------------------------------------------------------

/// List all placement rules.
pub async fn list_placement_rules(
    RequireAdmin(_admin): RequireAdmin,
    State(state): State<AppState>,
) -> AppResult<impl IntoResponse> {
    let rules = PlacementRuleRepo::list_all(&state.pool).await?;
    Ok(Json(DataResponse { data: rules }))
}

// ---------------------------------------------------------------------------
// POST /admin/placement-rules
// ---------------------------------------------------------------------------

/// Create a new placement rule.
pub async fn create_placement_rule(
    RequireAdmin(admin): RequireAdmin,
    State(state): State<AppState>,
    Json(input): Json<CreatePlacementRule>,
) -> AppResult<impl IntoResponse> {
    download_manager::validate_model_type(&input.model_type)?;

    let rule = PlacementRuleRepo::create(&state.pool, &input).await?;

    tracing::info!(
        rule_id = rule.id,
        model_type = %rule.model_type,
        admin_id = admin.user_id,
        "Placement rule created",
    );

    Ok((StatusCode::CREATED, Json(DataResponse { data: rule })))
}

// ---------------------------------------------------------------------------
// PUT /admin/placement-rules/{id}
// ---------------------------------------------------------------------------

/// Update a placement rule.
pub async fn update_placement_rule(
    RequireAdmin(admin): RequireAdmin,
    State(state): State<AppState>,
    Path(id): Path<DbId>,
    Json(input): Json<UpdatePlacementRule>,
) -> AppResult<impl IntoResponse> {
    ensure_rule_exists(&state.pool, id).await?;

    if let Some(ref mt) = input.model_type {
        download_manager::validate_model_type(mt)?;
    }

    let rule = PlacementRuleRepo::update(&state.pool, id, &input)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound {
            entity: "PlacementRule",
            id,
        }))?;

    tracing::info!(
        rule_id = id,
        admin_id = admin.user_id,
        "Placement rule updated",
    );

    Ok(Json(DataResponse { data: rule }))
}

// ---------------------------------------------------------------------------
// DELETE /admin/placement-rules/{id}
// ---------------------------------------------------------------------------

/// Delete a placement rule.
pub async fn delete_placement_rule(
    RequireAdmin(admin): RequireAdmin,
    State(state): State<AppState>,
    Path(id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    ensure_rule_exists(&state.pool, id).await?;

    PlacementRuleRepo::delete(&state.pool, id).await?;

    tracing::info!(
        rule_id = id,
        admin_id = admin.user_id,
        "Placement rule deleted",
    );

    Ok(StatusCode::NO_CONTENT)
}

// ===========================================================================
// API token endpoints
// ===========================================================================

// ---------------------------------------------------------------------------
// GET /user/api-tokens
// ---------------------------------------------------------------------------

/// List all API tokens for the current user (safe info only).
pub async fn list_tokens(
    user: AuthUser,
    State(state): State<AppState>,
) -> AppResult<impl IntoResponse> {
    let tokens: Vec<ApiTokenInfo> =
        UserApiTokenRepo::list_by_user(&state.pool, user.user_id).await?;
    Ok(Json(DataResponse { data: tokens }))
}

// ---------------------------------------------------------------------------
// POST /user/api-tokens
// ---------------------------------------------------------------------------

/// Store (or update) an API token for an external service.
pub async fn store_token(
    user: AuthUser,
    State(state): State<AppState>,
    Json(input): Json<StoreTokenRequest>,
) -> AppResult<impl IntoResponse> {
    download_manager::validate_service_name(&input.service_name)?;

    if input.token.trim().is_empty() {
        return Err(AppError::BadRequest("Token must not be empty".to_string()));
    }

    let hint = download_manager::generate_token_hint(&input.token);

    // In production, this would use proper encryption.
    // For now, store the token bytes directly (placeholder for encryption layer).
    let encrypted = input.token.as_bytes().to_vec();

    let token = UserApiTokenRepo::upsert(
        &state.pool,
        user.user_id,
        &input.service_name,
        &encrypted,
        &hint,
    )
    .await?;

    tracing::info!(
        user_id = user.user_id,
        service = %input.service_name,
        "API token stored",
    );

    let info = ApiTokenInfo {
        service_name: token.service_name,
        token_hint: token.token_hint,
        is_valid: token.is_valid,
        last_used_at: token.last_used_at,
    };

    Ok((StatusCode::CREATED, Json(DataResponse { data: info })))
}

// ---------------------------------------------------------------------------
// DELETE /user/api-tokens/{service}
// ---------------------------------------------------------------------------

/// Delete an API token for a specific service.
pub async fn delete_token(
    user: AuthUser,
    State(state): State<AppState>,
    Path(service): Path<String>,
) -> AppResult<impl IntoResponse> {
    download_manager::validate_service_name(&service)?;

    let deleted = UserApiTokenRepo::delete(&state.pool, user.user_id, &service).await?;

    if !deleted {
        return Err(AppError::Core(CoreError::NotFound {
            entity: "ApiToken",
            id: 0,
        }));
    }

    tracing::info!(
        user_id = user.user_id,
        service = %service,
        "API token deleted",
    );

    Ok(StatusCode::NO_CONTENT)
}
