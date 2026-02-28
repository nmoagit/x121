//! Models and DTOs for shareable preview links (PRD-84).

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};

// ---------------------------------------------------------------------------
// SharedLink entity
// ---------------------------------------------------------------------------

/// A row from the `shared_links` table.
///
/// The `token_hash` is never exposed to external consumers; the plaintext
/// token is returned only on creation.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct SharedLink {
    pub id: DbId,
    #[serde(skip_serializing)]
    pub token_hash: String,
    pub scope_type: String,
    pub scope_id: DbId,
    pub created_by: DbId,
    pub expires_at: Timestamp,
    pub max_views: Option<i32>,
    pub current_views: i32,
    #[serde(skip_serializing)]
    pub password_hash: Option<String>,
    pub is_revoked: bool,
    pub settings_json: Option<serde_json::Value>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

// ---------------------------------------------------------------------------
// Create DTO
// ---------------------------------------------------------------------------

/// DTO for creating a new shared link.
#[derive(Debug, Deserialize)]
pub struct CreateSharedLink {
    pub scope_type: String,
    pub scope_id: DbId,
    pub expiry_hours: i64,
    pub max_views: Option<i32>,
    pub password: Option<String>,
    pub settings_json: Option<serde_json::Value>,
}

// ---------------------------------------------------------------------------
// LinkAccessLogEntry entity
// ---------------------------------------------------------------------------

/// A row from the `link_access_log` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct LinkAccessLogEntry {
    pub id: DbId,
    pub link_id: DbId,
    pub accessed_at: Timestamp,
    pub ip_address: Option<String>,
    pub user_agent: Option<String>,
    pub feedback_text: Option<String>,
    pub decision: Option<String>,
    pub viewer_name: Option<String>,
    pub created_at: Timestamp,
}

// ---------------------------------------------------------------------------
// Feedback DTO
// ---------------------------------------------------------------------------

/// DTO for submitting reviewer feedback on a shared link.
#[derive(Debug, Deserialize)]
pub struct SubmitFeedback {
    pub viewer_name: Option<String>,
    pub decision: Option<String>,
    pub feedback_text: Option<String>,
}

// ---------------------------------------------------------------------------
// Password verification DTO
// ---------------------------------------------------------------------------

/// DTO for verifying a shared link password.
#[derive(Debug, Deserialize)]
pub struct VerifyPassword {
    pub password: String,
}
