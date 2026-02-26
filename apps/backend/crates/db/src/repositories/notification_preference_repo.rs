//! Repository for the `notification_preferences` and `user_notification_settings` tables.

use sqlx::PgPool;
use x121_core::types::DbId;

use crate::models::notification::{
    NotificationPreference, UpdateNotificationSettings, UserNotificationSettings,
};

/// Column list for `notification_preferences` queries.
const PREF_COLUMNS: &str =
    "id, user_id, event_type_id, is_enabled, channels, scope, created_at, updated_at";

/// Column list for `user_notification_settings` queries.
const SETTINGS_COLUMNS: &str = "id, user_id, dnd_enabled, dnd_until, digest_enabled, \
    digest_interval, digest_last_sent_at, created_at, updated_at";

/// Provides CRUD operations for notification preferences and user settings.
pub struct NotificationPreferenceRepo;

impl NotificationPreferenceRepo {
    /// List all notification preferences for a user.
    pub async fn list_for_user(
        pool: &PgPool,
        user_id: DbId,
    ) -> Result<Vec<NotificationPreference>, sqlx::Error> {
        let query = format!(
            "SELECT {PREF_COLUMNS} FROM notification_preferences \
             WHERE user_id = $1 \
             ORDER BY event_type_id"
        );
        sqlx::query_as::<_, NotificationPreference>(&query)
            .bind(user_id)
            .fetch_all(pool)
            .await
    }

    /// Get the preference for a specific event type and user.
    pub async fn get_for_event_type(
        pool: &PgPool,
        user_id: DbId,
        event_type_id: DbId,
    ) -> Result<Option<NotificationPreference>, sqlx::Error> {
        let query = format!(
            "SELECT {PREF_COLUMNS} FROM notification_preferences \
             WHERE user_id = $1 AND event_type_id = $2"
        );
        sqlx::query_as::<_, NotificationPreference>(&query)
            .bind(user_id)
            .bind(event_type_id)
            .fetch_optional(pool)
            .await
    }

    /// Insert or update a notification preference.
    ///
    /// Uses `INSERT ... ON CONFLICT (user_id, event_type_id) DO UPDATE` to
    /// upsert in a single round-trip.
    pub async fn upsert(
        pool: &PgPool,
        user_id: DbId,
        event_type_id: DbId,
        is_enabled: bool,
        channels: &serde_json::Value,
        scope: &str,
    ) -> Result<NotificationPreference, sqlx::Error> {
        let query = format!(
            "INSERT INTO notification_preferences \
                (user_id, event_type_id, is_enabled, channels, scope) \
             VALUES ($1, $2, $3, $4, $5) \
             ON CONFLICT (user_id, event_type_id) DO UPDATE SET \
                is_enabled = EXCLUDED.is_enabled, \
                channels = EXCLUDED.channels, \
                scope = EXCLUDED.scope, \
                updated_at = NOW() \
             RETURNING {PREF_COLUMNS}"
        );
        sqlx::query_as::<_, NotificationPreference>(&query)
            .bind(user_id)
            .bind(event_type_id)
            .bind(is_enabled)
            .bind(channels)
            .bind(scope)
            .fetch_one(pool)
            .await
    }

    /// Get the user's global notification settings (DND, digest).
    pub async fn get_settings(
        pool: &PgPool,
        user_id: DbId,
    ) -> Result<Option<UserNotificationSettings>, sqlx::Error> {
        let query =
            format!("SELECT {SETTINGS_COLUMNS} FROM user_notification_settings WHERE user_id = $1");
        sqlx::query_as::<_, UserNotificationSettings>(&query)
            .bind(user_id)
            .fetch_optional(pool)
            .await
    }

    /// Insert or update user notification settings.
    ///
    /// Uses `COALESCE` to only overwrite fields that are `Some` in the input.
    pub async fn upsert_settings(
        pool: &PgPool,
        user_id: DbId,
        settings: &UpdateNotificationSettings,
    ) -> Result<UserNotificationSettings, sqlx::Error> {
        let query = format!(
            "INSERT INTO user_notification_settings \
                (user_id, dnd_enabled, dnd_until, digest_enabled, digest_interval) \
             VALUES ($1, COALESCE($2, false), $3, COALESCE($4, false), COALESCE($5, '24h')) \
             ON CONFLICT (user_id) DO UPDATE SET \
                dnd_enabled = COALESCE($2, user_notification_settings.dnd_enabled), \
                dnd_until = COALESCE($3, user_notification_settings.dnd_until), \
                digest_enabled = COALESCE($4, user_notification_settings.digest_enabled), \
                digest_interval = COALESCE($5, user_notification_settings.digest_interval), \
                updated_at = NOW() \
             RETURNING {SETTINGS_COLUMNS}"
        );
        sqlx::query_as::<_, UserNotificationSettings>(&query)
            .bind(user_id)
            .bind(settings.dnd_enabled)
            .bind(settings.dnd_until)
            .bind(settings.digest_enabled)
            .bind(&settings.digest_interval)
            .fetch_one(pool)
            .await
    }

    /// List users whose digest is enabled and due to be sent.
    ///
    /// A digest is "due" when the user has `digest_enabled = true` and either:
    /// - `digest_last_sent_at` is NULL (never sent), or
    /// - enough time has elapsed since the last send (based on `digest_interval`).
    pub async fn list_users_due_for_digest(
        pool: &PgPool,
    ) -> Result<Vec<UserNotificationSettings>, sqlx::Error> {
        let query = format!(
            "SELECT {SETTINGS_COLUMNS} FROM user_notification_settings \
             WHERE digest_enabled = true \
               AND (digest_last_sent_at IS NULL \
                    OR NOW() - digest_last_sent_at > digest_interval::interval) \
             ORDER BY id"
        );
        sqlx::query_as::<_, UserNotificationSettings>(&query)
            .fetch_all(pool)
            .await
    }

    /// Update the `digest_last_sent_at` timestamp to now for a specific user.
    pub async fn mark_digest_sent(pool: &PgPool, user_id: DbId) -> Result<(), sqlx::Error> {
        sqlx::query(
            "UPDATE user_notification_settings SET digest_last_sent_at = NOW() WHERE user_id = $1",
        )
        .bind(user_id)
        .execute(pool)
        .await?;
        Ok(())
    }
}
