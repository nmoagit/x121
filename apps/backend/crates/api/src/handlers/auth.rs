//! Handlers for the `/auth` resource (login, refresh, logout).

use axum::extract::State;
use axum::http::StatusCode;
use axum::Json;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use trulience_core::error::CoreError;
use trulience_core::types::DbId;
use trulience_db::repositories::{RoleRepo, SessionRepo, UserRepo};

use crate::auth::jwt::{generate_access_token, generate_refresh_token, hash_refresh_token};
use crate::auth::password::verify_password;
use crate::error::{AppError, AppResult};
use crate::middleware::auth::AuthUser;
use crate::state::AppState;

/// Maximum consecutive failed login attempts before locking the account.
const MAX_FAILED_ATTEMPTS: i32 = 5;

/// Duration in minutes to lock an account after exceeding failed attempts.
const LOCK_DURATION_MINS: i64 = 15;

// ---------------------------------------------------------------------------
// Request / response types
// ---------------------------------------------------------------------------

/// Request body for `POST /auth/login`.
#[derive(Debug, Deserialize)]
pub struct LoginRequest {
    pub username: String,
    pub password: String,
}

/// Request body for `POST /auth/refresh`.
#[derive(Debug, Deserialize)]
pub struct RefreshRequest {
    pub refresh_token: String,
}

/// Successful authentication response returned by login and refresh.
#[derive(Debug, Serialize)]
pub struct AuthResponse {
    pub access_token: String,
    pub refresh_token: String,
    /// Access token lifetime in seconds.
    pub expires_in: i64,
    pub user: UserInfo,
}

/// Public user info embedded in [`AuthResponse`].
#[derive(Debug, Serialize)]
pub struct UserInfo {
    pub id: DbId,
    pub username: String,
    pub email: String,
    pub role: String,
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/// POST /api/v1/auth/login
///
/// Authenticate with username + password. Returns access and refresh tokens.
pub async fn login(
    State(state): State<AppState>,
    Json(input): Json<LoginRequest>,
) -> AppResult<Json<AuthResponse>> {
    // 1. Find user by username.
    let user = UserRepo::find_by_username(&state.pool, &input.username)
        .await?
        .ok_or_else(|| {
            AppError::Core(CoreError::Unauthorized(
                "Invalid username or password".into(),
            ))
        })?;

    // 2. Check if the account is active.
    if !user.is_active {
        return Err(AppError::Core(CoreError::Forbidden(
            "Account is deactivated".into(),
        )));
    }

    // 3. Check if the account is temporarily locked.
    if let Some(locked_until) = user.locked_until {
        if locked_until > Utc::now() {
            return Err(AppError::Core(CoreError::Forbidden(
                "Account is temporarily locked. Try again later.".into(),
            )));
        }
    }

    // 4. Verify password.
    let password_valid = verify_password(&input.password, &user.password_hash)
        .map_err(|e| AppError::InternalError(format!("Password verification error: {e}")))?;

    if !password_valid {
        // 5. On failure: increment counter, lock if threshold exceeded.
        UserRepo::increment_failed_login(&state.pool, user.id).await?;

        let new_count = user.failed_login_count + 1;
        if new_count >= MAX_FAILED_ATTEMPTS {
            let lock_until = Utc::now() + chrono::Duration::minutes(LOCK_DURATION_MINS);
            UserRepo::lock_account(&state.pool, user.id, lock_until).await?;
        }

        return Err(AppError::Core(CoreError::Unauthorized(
            "Invalid username or password".into(),
        )));
    }

    // 6. On success: reset failed count, set last_login_at.
    UserRepo::record_successful_login(&state.pool, user.id).await?;

    // 7. Resolve role name for JWT claims.
    let role_name = RoleRepo::resolve_name(&state.pool, user.role_id).await?;

    // 8. Generate tokens and create session.
    let response =
        create_auth_response(&state, user.id, &user.username, &user.email, &role_name).await?;

    Ok(Json(response))
}

/// POST /api/v1/auth/refresh
///
/// Exchange a valid refresh token for new access + refresh tokens.
pub async fn refresh(
    State(state): State<AppState>,
    Json(input): Json<RefreshRequest>,
) -> AppResult<Json<AuthResponse>> {
    // 1. Hash the provided refresh token.
    let token_hash = hash_refresh_token(&input.refresh_token);

    // 2. Find matching active session.
    let session = SessionRepo::find_by_refresh_token_hash(&state.pool, &token_hash)
        .await?
        .ok_or_else(|| {
            AppError::Core(CoreError::Unauthorized(
                "Invalid or expired refresh token".into(),
            ))
        })?;

    // 3. Revoke old session (token rotation).
    SessionRepo::revoke(&state.pool, session.id).await?;

    // 4. Find user and resolve role.
    let user = UserRepo::find_by_id(&state.pool, session.user_id)
        .await?
        .ok_or_else(|| AppError::Core(CoreError::Unauthorized("User no longer exists".into())))?;

    if !user.is_active {
        return Err(AppError::Core(CoreError::Forbidden(
            "Account is deactivated".into(),
        )));
    }

    let role_name = RoleRepo::resolve_name(&state.pool, user.role_id).await?;

    // 5. Generate new tokens and create new session.
    let response =
        create_auth_response(&state, user.id, &user.username, &user.email, &role_name).await?;

    Ok(Json(response))
}

/// POST /api/v1/auth/logout
///
/// Revoke all sessions for the authenticated user. Returns 204 No Content.
pub async fn logout(State(state): State<AppState>, auth_user: AuthUser) -> AppResult<StatusCode> {
    SessionRepo::revoke_all_for_user(&state.pool, auth_user.user_id).await?;
    Ok(StatusCode::NO_CONTENT)
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Generate access + refresh tokens, persist a session row, and build the response.
async fn create_auth_response(
    state: &AppState,
    user_id: DbId,
    username: &str,
    email: &str,
    role: &str,
) -> AppResult<AuthResponse> {
    let access_token = generate_access_token(user_id, role, &state.config.jwt)
        .map_err(|e| AppError::InternalError(format!("Token generation error: {e}")))?;

    let (refresh_plaintext, refresh_hash) = generate_refresh_token();

    let expires_at =
        Utc::now() + chrono::Duration::days(state.config.jwt.refresh_token_expiry_days);

    let session_input = trulience_db::models::session::CreateSession {
        user_id,
        refresh_token_hash: refresh_hash,
        expires_at,
        user_agent: None,
        ip_address: None,
    };
    SessionRepo::create(&state.pool, &session_input).await?;

    let expires_in = state.config.jwt.access_token_expiry_mins * 60;

    Ok(AuthResponse {
        access_token,
        refresh_token: refresh_plaintext,
        expires_in,
        user: UserInfo {
            id: user_id,
            username: username.to_string(),
            email: email.to_string(),
            role: role.to_string(),
        },
    })
}
