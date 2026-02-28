//! Session management models and DTOs (PRD-98).
//!
//! Models for active sessions tracking, login attempt recording, and
//! session configuration key-value pairs.

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};

// ---------------------------------------------------------------------------
// Active Session
// ---------------------------------------------------------------------------

/// A row from the `active_sessions` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct ActiveSession {
    pub id: DbId,
    pub user_id: DbId,
    #[serde(skip_serializing)]
    pub token_hash: String,
    pub status: String,
    pub ip_address: Option<String>,
    pub user_agent: Option<String>,
    pub current_view: Option<String>,
    pub last_activity: Timestamp,
    pub started_at: Timestamp,
    pub ended_at: Option<Timestamp>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// DTO for creating a new active session.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateActiveSession {
    pub user_id: DbId,
    pub token_hash: String,
    pub ip_address: Option<String>,
    pub user_agent: Option<String>,
}

// ---------------------------------------------------------------------------
// Login Attempt
// ---------------------------------------------------------------------------

/// A row from the `login_attempts` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct LoginAttempt {
    pub id: DbId,
    pub username: String,
    pub user_id: Option<DbId>,
    pub ip_address: Option<String>,
    pub user_agent: Option<String>,
    pub success: bool,
    pub failure_reason: Option<String>,
    pub created_at: Timestamp,
}

/// DTO for recording a new login attempt.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateLoginAttempt {
    pub username: String,
    pub user_id: Option<DbId>,
    pub ip_address: Option<String>,
    pub user_agent: Option<String>,
    pub success: bool,
    pub failure_reason: Option<String>,
}

// ---------------------------------------------------------------------------
// Session Config
// ---------------------------------------------------------------------------

/// A row from the `session_configs` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct SessionConfig {
    pub id: DbId,
    pub key: String,
    pub value: String,
    pub description: Option<String>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

/// Paginated list of active sessions for admin views.
#[derive(Debug, Clone, Serialize)]
pub struct ActiveSessionList {
    pub items: Vec<ActiveSession>,
    pub total: i64,
}

/// Login history response with pagination.
#[derive(Debug, Clone, Serialize)]
pub struct LoginHistoryList {
    pub items: Vec<LoginAttempt>,
    pub total: i64,
}
