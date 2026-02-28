//! Director's View models and DTOs (PRD-55).
//!
//! Contains entity structs for `push_subscriptions` and `offline_sync_log`,
//! plus create DTOs for inserts.

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};

// ---------------------------------------------------------------------------
// Push Subscription
// ---------------------------------------------------------------------------

/// A row from the `push_subscriptions` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct PushSubscription {
    pub id: DbId,
    pub user_id: DbId,
    pub endpoint: String,
    pub p256dh_key: String,
    pub auth_key: String,
    pub user_agent: Option<String>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// DTO for creating or replacing a push subscription.
#[derive(Debug, Deserialize)]
pub struct CreatePushSubscription {
    pub endpoint: String,
    pub p256dh_key: String,
    pub auth_key: String,
    pub user_agent: Option<String>,
}

// ---------------------------------------------------------------------------
// Offline Sync Action
// ---------------------------------------------------------------------------

/// A row from the `offline_sync_log` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct OfflineSyncAction {
    pub id: DbId,
    pub user_id: DbId,
    pub action_type: String,
    pub target_id: DbId,
    pub payload_json: Option<serde_json::Value>,
    pub synced: bool,
    pub synced_at: Option<Timestamp>,
    pub client_timestamp: Timestamp,
    pub created_at: Timestamp,
}

/// DTO for creating a new offline sync action.
#[derive(Debug, Deserialize)]
pub struct CreateOfflineSyncAction {
    pub target_id: DbId,
    pub action_type: String,
    pub client_timestamp: Timestamp,
    pub payload_json: Option<serde_json::Value>,
}
