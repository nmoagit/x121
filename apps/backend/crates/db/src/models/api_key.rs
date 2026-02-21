//! API key, webhook, and external API audit log models and DTOs (PRD-12).

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use trulience_core::types::{DbId, Timestamp};

// ---------------------------------------------------------------------------
// API Key Scope
// ---------------------------------------------------------------------------

/// A row from the `api_key_scopes` lookup table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct ApiKeyScope {
    pub id: DbId,
    pub name: String,
    pub description: Option<String>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

// ---------------------------------------------------------------------------
// API Key
// ---------------------------------------------------------------------------

/// A row from the `api_keys` table.
///
/// **Note:** `key_hash` is never serialized to responses. The `key_prefix`
/// field is used for human-readable identification.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct ApiKey {
    pub id: DbId,
    pub name: String,
    pub description: Option<String>,
    #[serde(skip_serializing)]
    pub key_hash: String,
    pub key_prefix: String,
    pub scope_id: DbId,
    pub project_id: Option<DbId>,
    pub created_by: DbId,
    pub rate_limit_read_per_min: i32,
    pub rate_limit_write_per_min: i32,
    pub is_active: bool,
    pub last_used_at: Option<Timestamp>,
    pub expires_at: Option<Timestamp>,
    pub revoked_at: Option<Timestamp>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// Lightweight view of an API key for list responses.
/// Includes scope name via JOIN but omits the hash.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct ApiKeyListItem {
    pub id: DbId,
    pub name: String,
    pub description: Option<String>,
    pub key_prefix: String,
    pub scope_name: String,
    pub project_id: Option<DbId>,
    pub rate_limit_read_per_min: i32,
    pub rate_limit_write_per_min: i32,
    pub is_active: bool,
    pub last_used_at: Option<Timestamp>,
    pub expires_at: Option<Timestamp>,
    pub revoked_at: Option<Timestamp>,
    pub created_at: Timestamp,
}

/// Response returned when a new API key is created.
/// Includes the plaintext key (shown exactly once).
#[derive(Debug, Clone, Serialize)]
pub struct ApiKeyCreatedResponse {
    pub id: DbId,
    pub name: String,
    pub key_prefix: String,
    /// The full plaintext key. Shown **once** and never stored.
    pub plaintext_key: String,
    pub scope_name: String,
    pub project_id: Option<DbId>,
    pub created_at: Timestamp,
}

/// DTO for creating a new API key.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateApiKey {
    pub name: String,
    pub description: Option<String>,
    /// Scope name: `"read_only"`, `"project_read"`, `"full_access"`, `"project_full"`.
    pub scope: String,
    /// Required for project-scoped keys.
    pub project_id: Option<DbId>,
    pub rate_limit_read_per_min: Option<i32>,
    pub rate_limit_write_per_min: Option<i32>,
    /// Optional expiry timestamp (ISO 8601).
    pub expires_at: Option<String>,
}

/// DTO for updating an existing API key.
#[derive(Debug, Clone, Deserialize)]
pub struct UpdateApiKey {
    pub name: Option<String>,
    pub description: Option<String>,
    pub rate_limit_read_per_min: Option<i32>,
    pub rate_limit_write_per_min: Option<i32>,
    pub is_active: Option<bool>,
}

// ---------------------------------------------------------------------------
// Webhook
// ---------------------------------------------------------------------------

/// A row from the `webhooks` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct Webhook {
    pub id: DbId,
    pub name: String,
    pub url: String,
    #[serde(skip_serializing)]
    pub secret: Option<String>,
    pub event_types: serde_json::Value,
    pub is_enabled: bool,
    pub created_by: DbId,
    pub last_triggered_at: Option<Timestamp>,
    pub failure_count: i32,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// DTO for creating a new webhook.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateWebhook {
    pub name: String,
    pub url: String,
    pub secret: Option<String>,
    /// Array of event type names to subscribe to.
    pub event_types: Vec<String>,
    pub is_enabled: Option<bool>,
}

/// DTO for updating an existing webhook.
#[derive(Debug, Clone, Deserialize)]
pub struct UpdateWebhook {
    pub name: Option<String>,
    pub url: Option<String>,
    pub secret: Option<String>,
    pub event_types: Option<Vec<String>>,
    pub is_enabled: Option<bool>,
}

// ---------------------------------------------------------------------------
// Webhook Delivery
// ---------------------------------------------------------------------------

/// A row from the `webhook_deliveries` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct WebhookDelivery {
    pub id: DbId,
    pub webhook_id: DbId,
    pub event_id: Option<DbId>,
    pub payload: serde_json::Value,
    pub status: String,
    pub response_status_code: Option<i16>,
    pub response_body: Option<String>,
    pub attempt_count: i16,
    pub max_attempts: i16,
    pub next_retry_at: Option<Timestamp>,
    pub delivered_at: Option<Timestamp>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

// ---------------------------------------------------------------------------
// API Audit Log
// ---------------------------------------------------------------------------

/// A row from the `api_audit_log` table (append-only).
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct ApiAuditLogEntry {
    pub id: DbId,
    pub api_key_id: Option<DbId>,
    pub method: String,
    pub path: String,
    pub query_params: Option<String>,
    pub request_body_size: Option<i32>,
    pub response_status: i16,
    pub response_time_ms: Option<i32>,
    pub ip_address: Option<String>,
    pub user_agent: Option<String>,
    pub created_at: Timestamp,
}
