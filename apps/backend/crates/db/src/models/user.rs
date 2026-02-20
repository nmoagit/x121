//! User entity model and DTOs.

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use trulience_core::types::{DbId, Timestamp};

/// Full user row from the `users` table.
///
/// Contains the password hash -- NEVER serialize this to API responses directly.
/// Use [`UserResponse`] for external-facing output.
#[derive(Debug, Clone, FromRow)]
pub struct User {
    pub id: DbId,
    pub username: String,
    pub email: String,
    pub password_hash: String,
    pub role_id: DbId,
    pub is_active: bool,
    pub last_login_at: Option<Timestamp>,
    pub failed_login_count: i32,
    pub locked_until: Option<Timestamp>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// Safe user representation for API responses (no password hash).
#[derive(Debug, Clone, Serialize)]
pub struct UserResponse {
    pub id: DbId,
    pub username: String,
    pub email: String,
    /// Resolved role name (e.g. `"admin"`, `"creator"`).
    pub role: String,
    pub role_id: DbId,
    pub is_active: bool,
    pub last_login_at: Option<Timestamp>,
    pub created_at: Timestamp,
}

/// DTO for creating a new user.
#[derive(Debug, Deserialize)]
pub struct CreateUser {
    pub username: String,
    pub email: String,
    pub password_hash: String,
    pub role_id: DbId,
}

/// DTO for updating an existing user. All fields are optional.
#[derive(Debug, Deserialize)]
pub struct UpdateUser {
    pub username: Option<String>,
    pub email: Option<String>,
    pub role_id: Option<DbId>,
    pub is_active: Option<bool>,
}
