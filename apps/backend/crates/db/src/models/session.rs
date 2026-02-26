//! User session model and DTOs.

use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};

/// A user session row from the `user_sessions` table.
#[derive(Debug, Clone, FromRow)]
pub struct UserSession {
    pub id: DbId,
    pub user_id: DbId,
    pub refresh_token_hash: String,
    pub expires_at: Timestamp,
    pub is_revoked: bool,
    pub user_agent: Option<String>,
    pub ip_address: Option<String>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// DTO for creating a new user session.
pub struct CreateSession {
    pub user_id: DbId,
    pub refresh_token_hash: String,
    pub expires_at: Timestamp,
    pub user_agent: Option<String>,
    pub ip_address: Option<String>,
}
