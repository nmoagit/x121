//! User API token entity model and DTOs (PRD-104).

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use trulience_core::types::{DbId, Timestamp};

/// A row from the `user_api_tokens` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct UserApiToken {
    pub id: DbId,
    pub user_id: DbId,
    pub service_name: String,
    /// Encrypted token bytes. Skipped during serialization to prevent exposure.
    #[serde(skip_serializing)]
    pub encrypted_token: Vec<u8>,
    pub token_hint: String,
    pub is_valid: bool,
    pub last_used_at: Option<Timestamp>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// Safe API-facing token info (never exposes the encrypted token).
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct ApiTokenInfo {
    pub service_name: String,
    pub token_hint: String,
    pub is_valid: bool,
    pub last_used_at: Option<Timestamp>,
}

/// API request DTO for storing a new API token.
#[derive(Debug, Clone, Deserialize)]
pub struct StoreTokenRequest {
    pub service_name: String,
    pub token: String,
}
