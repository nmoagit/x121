//! Handlers for the `/admin` resource (user management).
//!
//! All handlers require the `admin` role via [`RequireAdmin`].

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::Json;
use serde::Deserialize;
use x121_core::error::CoreError;
use x121_core::types::DbId;
use x121_db::models::user::{CreateUser, UpdateUser, User, UserResponse};
use x121_db::repositories::{RoleRepo, UserRepo};

use crate::auth::password::{hash_password, validate_password_strength};
use crate::error::{AppError, AppResult};
use crate::middleware::rbac::RequireAdmin;
use crate::state::AppState;

/// Minimum password length enforced on user creation and password reset.
const MIN_PASSWORD_LENGTH: usize = 12;

// ---------------------------------------------------------------------------
// Request types
// ---------------------------------------------------------------------------

/// Request body for `POST /admin/users`.
#[derive(Debug, Deserialize)]
pub struct CreateUserRequest {
    pub username: String,
    pub email: String,
    pub password: String,
    pub role_id: DbId,
}

/// Request body for `PUT /admin/users/{id}`.
#[derive(Debug, Deserialize)]
pub struct UpdateUserRequest {
    pub username: Option<String>,
    pub email: Option<String>,
    pub role_id: Option<DbId>,
    pub is_active: Option<bool>,
}

/// Request body for `POST /admin/users/{id}/reset-password`.
#[derive(Debug, Deserialize)]
pub struct ResetPasswordRequest {
    pub new_password: String,
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/// POST /api/v1/admin/users
///
/// Create a new user. Validates password strength, hashes it, and returns
/// a safe [`UserResponse`] with 201 Created.
pub async fn create_user(
    State(state): State<AppState>,
    RequireAdmin(_admin): RequireAdmin,
    Json(input): Json<CreateUserRequest>,
) -> AppResult<(StatusCode, Json<UserResponse>)> {
    // Validate password strength.
    validate_password_strength(&input.password, MIN_PASSWORD_LENGTH)
        .map_err(|msg| AppError::Core(CoreError::Validation(msg)))?;

    // Hash the password.
    let hashed = hash_password(&input.password)
        .map_err(|e| AppError::InternalError(format!("Password hashing error: {e}")))?;

    let create_dto = CreateUser {
        username: input.username,
        email: input.email,
        password_hash: hashed,
        role_id: input.role_id,
    };

    let user = UserRepo::create(&state.pool, &create_dto).await?;
    let response = user_to_response(&state, &user).await?;

    Ok((StatusCode::CREATED, Json(response)))
}

/// GET /api/v1/admin/users
///
/// List all users with resolved role names.
pub async fn list_users(
    State(state): State<AppState>,
    RequireAdmin(_admin): RequireAdmin,
) -> AppResult<Json<Vec<UserResponse>>> {
    let users = UserRepo::list(&state.pool).await?;

    // Pre-fetch all roles to avoid N+1 queries.
    let roles = RoleRepo::list(&state.pool).await?;

    let responses: Vec<UserResponse> = users
        .iter()
        .map(|u| {
            let role_name = roles
                .iter()
                .find(|r| r.id == u.role_id)
                .map(|r| r.name.clone())
                .unwrap_or_else(|| "unknown".to_string());
            build_user_response(u, role_name)
        })
        .collect();

    Ok(Json(responses))
}

/// GET /api/v1/admin/users/{id}
///
/// Get a single user by ID.
pub async fn get_user(
    State(state): State<AppState>,
    RequireAdmin(_admin): RequireAdmin,
    Path(id): Path<DbId>,
) -> AppResult<Json<UserResponse>> {
    let user = UserRepo::find_by_id(&state.pool, id)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound { entity: "User", id }))?;

    let response = user_to_response(&state, &user).await?;
    Ok(Json(response))
}

/// PUT /api/v1/admin/users/{id}
///
/// Update a user's profile fields (not password).
pub async fn update_user(
    State(state): State<AppState>,
    RequireAdmin(_admin): RequireAdmin,
    Path(id): Path<DbId>,
    Json(input): Json<UpdateUserRequest>,
) -> AppResult<Json<UserResponse>> {
    let update_dto = UpdateUser {
        username: input.username,
        email: input.email,
        role_id: input.role_id,
        is_active: input.is_active,
    };

    let user = UserRepo::update(&state.pool, id, &update_dto)
        .await?
        .ok_or(AppError::Core(CoreError::NotFound { entity: "User", id }))?;

    let response = user_to_response(&state, &user).await?;
    Ok(Json(response))
}

/// DELETE /api/v1/admin/users/{id}
///
/// Soft-deactivate a user (sets `is_active = false`). Returns 204 No Content.
pub async fn deactivate_user(
    State(state): State<AppState>,
    RequireAdmin(_admin): RequireAdmin,
    Path(id): Path<DbId>,
) -> AppResult<StatusCode> {
    let deactivated = UserRepo::deactivate(&state.pool, id).await?;
    if deactivated {
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(AppError::Core(CoreError::NotFound { entity: "User", id }))
    }
}

/// POST /api/v1/admin/users/{id}/reset-password
///
/// Admin-initiated password reset for a user.
pub async fn reset_password(
    State(state): State<AppState>,
    RequireAdmin(_admin): RequireAdmin,
    Path(id): Path<DbId>,
    Json(input): Json<ResetPasswordRequest>,
) -> AppResult<StatusCode> {
    // Validate password strength.
    validate_password_strength(&input.new_password, MIN_PASSWORD_LENGTH)
        .map_err(|msg| AppError::Core(CoreError::Validation(msg)))?;

    // Hash the new password.
    let hashed = hash_password(&input.new_password)
        .map_err(|e| AppError::InternalError(format!("Password hashing error: {e}")))?;

    let updated = UserRepo::update_password(&state.pool, id, &hashed).await?;
    if updated {
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(AppError::Core(CoreError::NotFound { entity: "User", id }))
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Convert a [`User`] row into a safe [`UserResponse`] by resolving the role name.
async fn user_to_response(state: &AppState, user: &User) -> AppResult<UserResponse> {
    let role_name = RoleRepo::resolve_name(&state.pool, user.role_id).await?;
    Ok(build_user_response(user, role_name))
}

/// Build a [`UserResponse`] from a [`User`] and a pre-resolved role name.
fn build_user_response(user: &User, role: String) -> UserResponse {
    UserResponse {
        id: user.id,
        username: user.username.clone(),
        email: user.email.clone(),
        role,
        role_id: user.role_id,
        is_active: user.is_active,
        last_login_at: user.last_login_at,
        created_at: user.created_at,
    }
}
