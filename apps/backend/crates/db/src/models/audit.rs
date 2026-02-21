//! Audit log entity models and DTOs (PRD-45).
//!
//! Models for the append-only audit trail, retention policies, and integrity
//! verification. Audit logs have no `updated_at` field (immutable records).

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use trulience_core::types::{DbId, Timestamp};

// ---------------------------------------------------------------------------
// Audit log entity
// ---------------------------------------------------------------------------

/// A single audit log entry. Immutable once created (no updated_at).
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct AuditLog {
    pub id: DbId,
    pub timestamp: Timestamp,
    pub user_id: Option<DbId>,
    pub session_id: Option<String>,
    pub action_type: String,
    pub entity_type: Option<String>,
    pub entity_id: Option<DbId>,
    pub details_json: Option<serde_json::Value>,
    pub ip_address: Option<String>,
    pub user_agent: Option<String>,
    pub integrity_hash: Option<String>,
    pub created_at: Timestamp,
}

// ---------------------------------------------------------------------------
// Create DTO (batch-friendly)
// ---------------------------------------------------------------------------

/// DTO for inserting a new audit log entry.
///
/// Designed for batch inserts -- all fields except `action_type` are optional.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateAuditLog {
    pub user_id: Option<DbId>,
    pub session_id: Option<String>,
    pub action_type: String,
    pub entity_type: Option<String>,
    pub entity_id: Option<DbId>,
    pub details_json: Option<serde_json::Value>,
    pub ip_address: Option<String>,
    pub user_agent: Option<String>,
    pub integrity_hash: Option<String>,
}

// ---------------------------------------------------------------------------
// Query parameters
// ---------------------------------------------------------------------------

/// Filter parameters for querying audit logs.
#[derive(Debug, Clone, Deserialize)]
pub struct AuditQuery {
    pub user_id: Option<DbId>,
    pub action_type: Option<String>,
    pub entity_type: Option<String>,
    pub entity_id: Option<DbId>,
    pub from: Option<Timestamp>,
    pub to: Option<Timestamp>,
    pub search_text: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

// ---------------------------------------------------------------------------
// Retention policy entity
// ---------------------------------------------------------------------------

/// A retention policy for a specific log category.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct AuditRetentionPolicy {
    pub id: DbId,
    pub log_category: String,
    pub active_retention_days: i32,
    pub archive_retention_days: i32,
    pub enabled: bool,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// DTO for updating a retention policy.
#[derive(Debug, Clone, Deserialize)]
pub struct UpdateRetentionPolicy {
    pub active_retention_days: Option<i32>,
    pub archive_retention_days: Option<i32>,
    pub enabled: Option<bool>,
}

// ---------------------------------------------------------------------------
// Integrity check result
// ---------------------------------------------------------------------------

/// Paginated response for audit log queries.
#[derive(Debug, Clone, Serialize)]
pub struct AuditLogPage {
    pub items: Vec<AuditLog>,
    pub total: i64,
}

/// Result of an audit log integrity verification.
#[derive(Debug, Clone, Serialize)]
pub struct IntegrityCheckResult {
    /// Number of entries verified.
    pub verified_entries: i64,
    /// Whether the entire chain is valid.
    pub chain_valid: bool,
    /// ID of the first entry where the chain breaks, if any.
    pub first_break: Option<DbId>,
}
