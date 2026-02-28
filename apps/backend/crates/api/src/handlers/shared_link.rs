//! Handlers for shareable preview links (PRD-84).
//!
//! Provides authenticated endpoints for link management (create, list, revoke)
//! and public endpoints for external reviewers (validate, verify password,
//! submit feedback).

use axum::extract::{Path, Query, State};
use axum::http::{HeaderMap, StatusCode};
use axum::response::IntoResponse;
use axum::Json;
use serde::Serialize;

use x121_core::error::CoreError;
use x121_core::hashing::sha256_hex;
use x121_core::search::{clamp_limit, clamp_offset, DEFAULT_SEARCH_LIMIT, MAX_SEARCH_LIMIT};
use x121_core::shared_link;
use x121_core::types::{DbId, Timestamp};
use x121_db::models::shared_link::{CreateSharedLink, SharedLink, SubmitFeedback, VerifyPassword};
use x121_db::repositories::SharedLinkRepo;

use crate::error::{AppError, AppResult};
use crate::middleware::auth::AuthUser;
use crate::query::PaginationParams;
use crate::request::extract_ip;
use crate::response::DataResponse;
use crate::state::AppState;

// ---------------------------------------------------------------------------
// Response DTOs
// ---------------------------------------------------------------------------

/// Response returned when a new shared link is created.
/// Includes the plaintext token (shown exactly once).
#[derive(Debug, Serialize)]
pub struct CreateLinkResponse {
    pub link: SharedLink,
    pub plain_token: String,
    pub url: String,
}

/// Detailed view of a shared link with aggregated counts.
#[derive(Debug, Serialize)]
pub struct SharedLinkDetail {
    #[serde(flatten)]
    pub link: SharedLink,
    pub access_count: i64,
    pub feedback_count: i64,
}

/// Token validation response for public access.
#[derive(Debug, Serialize)]
pub struct TokenValidationResponse {
    pub scope_type: String,
    pub scope_id: DbId,
    pub password_required: bool,
    pub expires_at: Timestamp,
}

/// Response for bulk revoke operations.
#[derive(Debug, Serialize)]
pub struct BulkRevokeResponse {
    pub revoked_count: i64,
}

/// Request body for bulk revoke.
#[derive(Debug, serde::Deserialize)]
pub struct BulkRevokeRequest {
    pub ids: Vec<DbId>,
}

/// Response for password verification.
#[derive(Debug, Serialize)]
pub struct PasswordVerifiedResponse {
    pub verified: bool,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Verify that a shared link exists and belongs to the requesting user.
async fn ensure_link_exists(pool: &sqlx::PgPool, id: DbId, user_id: DbId) -> AppResult<SharedLink> {
    let link = SharedLinkRepo::find_by_id(pool, id).await?.ok_or_else(|| {
        AppError::Core(CoreError::NotFound {
            entity: "SharedLink",
            id,
        })
    })?;
    if link.created_by != user_id {
        return Err(AppError::Core(CoreError::Forbidden(
            "You do not have access to this shared link".into(),
        )));
    }
    Ok(link)
}

/// Look up a shared link by its plaintext token and verify it is still valid.
///
/// Hashes the token, fetches the link from the database, then checks revocation,
/// expiry, and view limits. Returns `AppError` on any failure.
async fn ensure_valid_link(pool: &sqlx::PgPool, token: &str) -> AppResult<SharedLink> {
    let token_hash = shared_link::hash_token(token);
    let link = SharedLinkRepo::find_by_token_hash(pool, &token_hash)
        .await?
        .ok_or_else(|| {
            AppError::Core(CoreError::NotFound {
                entity: "SharedLink",
                id: 0,
            })
        })?;

    shared_link::check_link_validity(
        link.is_revoked,
        link.expires_at,
        link.max_views,
        link.current_views,
    )
    .map_err(|e| AppError::BadRequest(e.to_string()))?;

    Ok(link)
}


/// Extract the user-agent string from request headers.
fn extract_user_agent(headers: &HeaderMap) -> Option<String> {
    headers
        .get("user-agent")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string())
}

// ---------------------------------------------------------------------------
// Authenticated handlers
// ---------------------------------------------------------------------------

/// POST /api/v1/shared-links
///
/// Create a new shareable preview link. Returns the plaintext token once.
pub async fn create_link(
    auth: AuthUser,
    State(state): State<AppState>,
    Json(input): Json<CreateSharedLink>,
) -> AppResult<impl IntoResponse> {
    // Validate inputs
    shared_link::validate_scope_type(&input.scope_type).map_err(AppError::BadRequest)?;
    shared_link::validate_expiry_hours(input.expiry_hours).map_err(AppError::BadRequest)?;
    if let Some(max) = input.max_views {
        shared_link::validate_max_views(max).map_err(AppError::BadRequest)?;
    }

    // Generate token
    let (plain_token, token_hash) = shared_link::generate_token();

    // Compute expiry timestamp
    let expires_at = chrono::Utc::now() + chrono::Duration::hours(input.expiry_hours);

    // Hash optional password
    let password_hash = input.password.as_deref().map(|p| sha256_hex(p.as_bytes()));

    let link = SharedLinkRepo::create(
        &state.pool,
        &token_hash,
        &input.scope_type,
        input.scope_id,
        auth.user_id,
        expires_at,
        input.max_views,
        password_hash.as_deref(),
        input.settings_json.as_ref(),
    )
    .await?;

    tracing::info!(
        link_id = link.id,
        scope_type = %input.scope_type,
        scope_id = input.scope_id,
        user_id = auth.user_id,
        "Shared link created",
    );

    let url = format!("/review/{plain_token}");
    let response = CreateLinkResponse {
        link,
        plain_token,
        url,
    };

    Ok((StatusCode::CREATED, Json(DataResponse { data: response })))
}

/// GET /api/v1/shared-links
///
/// List all shared links created by the authenticated user.
pub async fn list_links(
    auth: AuthUser,
    State(state): State<AppState>,
    Query(params): Query<PaginationParams>,
) -> AppResult<impl IntoResponse> {
    let limit = clamp_limit(params.limit, DEFAULT_SEARCH_LIMIT, MAX_SEARCH_LIMIT);
    let offset = clamp_offset(params.offset);

    let links = SharedLinkRepo::list_by_creator(&state.pool, auth.user_id, limit, offset).await?;
    Ok(Json(DataResponse { data: links }))
}

/// GET /api/v1/shared-links/{id}
///
/// Get a single shared link with access and feedback counts.
pub async fn get_link(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    let link = ensure_link_exists(&state.pool, id, auth.user_id).await?;
    let access_count = SharedLinkRepo::count_access(&state.pool, id).await?;
    let feedback_count = SharedLinkRepo::count_feedback(&state.pool, id).await?;

    let detail = SharedLinkDetail {
        link,
        access_count,
        feedback_count,
    };
    Ok(Json(DataResponse { data: detail }))
}

/// DELETE /api/v1/shared-links/{id}
///
/// Revoke a shared link (sets `is_revoked = true`).
pub async fn revoke_link(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(id): Path<DbId>,
) -> AppResult<impl IntoResponse> {
    // Verify ownership
    ensure_link_exists(&state.pool, id, auth.user_id).await?;

    let revoked = SharedLinkRepo::revoke(&state.pool, id)
        .await?
        .ok_or_else(|| AppError::BadRequest("Link is already revoked".into()))?;

    tracing::info!(link_id = id, user_id = auth.user_id, "Shared link revoked",);

    Ok(Json(DataResponse { data: revoked }))
}

/// POST /api/v1/shared-links/bulk-revoke
///
/// Revoke multiple shared links at once.
pub async fn bulk_revoke_links(
    auth: AuthUser,
    State(state): State<AppState>,
    Json(body): Json<BulkRevokeRequest>,
) -> AppResult<impl IntoResponse> {
    if body.ids.is_empty() {
        return Err(AppError::BadRequest("ids must not be empty".into()));
    }

    // Verify all links belong to the user before revoking
    for &id in &body.ids {
        ensure_link_exists(&state.pool, id, auth.user_id).await?;
    }

    let revoked_count = SharedLinkRepo::bulk_revoke(&state.pool, &body.ids).await?;

    tracing::info!(
        revoked_count = revoked_count,
        user_id = auth.user_id,
        "Shared links bulk-revoked",
    );

    Ok(Json(DataResponse {
        data: BulkRevokeResponse { revoked_count },
    }))
}

/// GET /api/v1/shared-links/{id}/activity
///
/// List access log entries for a shared link.
pub async fn get_link_activity(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(id): Path<DbId>,
    Query(params): Query<PaginationParams>,
) -> AppResult<impl IntoResponse> {
    // Verify ownership
    ensure_link_exists(&state.pool, id, auth.user_id).await?;

    let limit = clamp_limit(params.limit, DEFAULT_SEARCH_LIMIT, MAX_SEARCH_LIMIT);
    let offset = clamp_offset(params.offset);

    let entries = SharedLinkRepo::list_access_log(&state.pool, id, limit, offset).await?;
    Ok(Json(DataResponse { data: entries }))
}

// ---------------------------------------------------------------------------
// Public handlers (no auth required)
// ---------------------------------------------------------------------------

/// GET /api/v1/review/{token}
///
/// Validate a shared link token. Returns scope information and whether a
/// password is required. Also logs the access and increments the view count.
pub async fn validate_token(
    State(state): State<AppState>,
    Path(token): Path<String>,
    headers: HeaderMap,
) -> AppResult<impl IntoResponse> {
    let link = ensure_valid_link(&state.pool, &token).await?;

    // Log access and increment views
    let ip = extract_ip(&headers);
    let ua = extract_user_agent(&headers);
    SharedLinkRepo::log_access(&state.pool, link.id, ip.as_deref(), ua.as_deref()).await?;
    SharedLinkRepo::increment_views(&state.pool, link.id).await?;

    let response = TokenValidationResponse {
        scope_type: link.scope_type,
        scope_id: link.scope_id,
        password_required: link.password_hash.is_some(),
        expires_at: link.expires_at,
    };

    Ok(Json(DataResponse { data: response }))
}

/// POST /api/v1/review/{token}/verify-password
///
/// Verify the password for a password-protected shared link.
pub async fn verify_password(
    State(state): State<AppState>,
    Path(token): Path<String>,
    Json(body): Json<VerifyPassword>,
) -> AppResult<impl IntoResponse> {
    let link = ensure_valid_link(&state.pool, &token).await?;

    // Verify password
    let stored_hash = link
        .password_hash
        .ok_or_else(|| AppError::BadRequest("This link is not password-protected".into()))?;

    let input_hash = sha256_hex(body.password.as_bytes());
    if input_hash != stored_hash {
        return Err(AppError::Core(CoreError::Forbidden(
            "Incorrect password".into(),
        )));
    }

    Ok(Json(DataResponse {
        data: PasswordVerifiedResponse { verified: true },
    }))
}

/// POST /api/v1/review/{token}/feedback
///
/// Submit reviewer feedback (decision, comments) on a shared link.
pub async fn submit_feedback(
    State(state): State<AppState>,
    Path(token): Path<String>,
    headers: HeaderMap,
    Json(body): Json<SubmitFeedback>,
) -> AppResult<impl IntoResponse> {
    let link = ensure_valid_link(&state.pool, &token).await?;

    // Validate decision if provided
    if let Some(ref decision) = body.decision {
        shared_link::validate_decision(decision).map_err(AppError::BadRequest)?;
    }

    let ip = extract_ip(&headers);
    let ua = extract_user_agent(&headers);

    let entry = SharedLinkRepo::log_feedback(
        &state.pool,
        link.id,
        ip.as_deref(),
        ua.as_deref(),
        body.viewer_name.as_deref(),
        body.decision.as_deref(),
        body.feedback_text.as_deref(),
    )
    .await?;

    tracing::info!(
        link_id = link.id,
        decision = ?body.decision,
        "Reviewer feedback submitted",
    );

    Ok((StatusCode::CREATED, Json(DataResponse { data: entry })))
}
