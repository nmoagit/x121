//! Notification entity models and DTOs.

use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use x121_core::types::{DbId, Timestamp};

/// A row from the `notifications` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct Notification {
    pub id: DbId,
    pub event_id: DbId,
    pub user_id: DbId,
    pub channel: String,
    pub is_read: bool,
    pub read_at: Option<Timestamp>,
    pub is_delivered: bool,
    pub delivered_at: Option<Timestamp>,
    pub created_at: Timestamp,
}

/// A row from the `notification_preferences` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct NotificationPreference {
    pub id: DbId,
    pub user_id: DbId,
    pub event_type_id: DbId,
    pub is_enabled: bool,
    pub channels: serde_json::Value,
    pub scope: String,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// A row from the `user_notification_settings` table.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct UserNotificationSettings {
    pub id: DbId,
    pub user_id: DbId,
    pub dnd_enabled: bool,
    pub dnd_until: Option<Timestamp>,
    pub digest_enabled: bool,
    pub digest_interval: String,
    pub digest_last_sent_at: Option<Timestamp>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// DTO for updating a notification preference.
#[derive(Debug, Deserialize)]
pub struct UpdatePreference {
    pub is_enabled: Option<bool>,
    pub channels: Option<serde_json::Value>,
    pub scope: Option<String>,
}

/// DTO for updating user notification settings (DND, digest).
#[derive(Debug, Deserialize)]
pub struct UpdateNotificationSettings {
    pub dnd_enabled: Option<bool>,
    pub dnd_until: Option<Timestamp>,
    pub digest_enabled: Option<bool>,
    pub digest_interval: Option<String>,
}
