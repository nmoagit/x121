//! Repository for the `notifications` table.

use sqlx::PgPool;
use trulience_core::types::DbId;

use crate::models::notification::Notification;

/// Column list for `notifications` queries.
const COLUMNS: &str =
    "id, event_id, user_id, channel, is_read, read_at, is_delivered, delivered_at, created_at";

/// Provides CRUD operations for notifications.
pub struct NotificationRepo;

impl NotificationRepo {
    /// Create a notification for a user, returning the generated ID.
    pub async fn create(
        pool: &PgPool,
        event_id: DbId,
        user_id: DbId,
        channel: &str,
    ) -> Result<DbId, sqlx::Error> {
        sqlx::query_scalar(
            "INSERT INTO notifications (event_id, user_id, channel) \
             VALUES ($1, $2, $3) \
             RETURNING id",
        )
        .bind(event_id)
        .bind(user_id)
        .bind(channel)
        .fetch_one(pool)
        .await
    }

    /// List notifications for a user.
    ///
    /// When `unread_only` is `true`, only notifications with `is_read = false`
    /// are returned.
    pub async fn list_for_user(
        pool: &PgPool,
        user_id: DbId,
        unread_only: bool,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<Notification>, sqlx::Error> {
        let filter = if unread_only {
            "AND is_read = false"
        } else {
            ""
        };
        let query = format!(
            "SELECT {COLUMNS} FROM notifications \
             WHERE user_id = $1 {filter} \
             ORDER BY created_at DESC \
             LIMIT $2 OFFSET $3"
        );
        sqlx::query_as::<_, Notification>(&query)
            .bind(user_id)
            .bind(limit)
            .bind(offset)
            .fetch_all(pool)
            .await
    }

    /// Mark a single notification as read.
    ///
    /// Returns `true` if the notification was found for the given user and updated,
    /// `false` otherwise.
    pub async fn mark_read(
        pool: &PgPool,
        notification_id: DbId,
        user_id: DbId,
    ) -> Result<bool, sqlx::Error> {
        let result = sqlx::query(
            "UPDATE notifications \
             SET is_read = true, read_at = NOW() \
             WHERE id = $1 AND user_id = $2 AND is_read = false",
        )
        .bind(notification_id)
        .bind(user_id)
        .execute(pool)
        .await?;
        Ok(result.rows_affected() > 0)
    }

    /// Mark all unread notifications as read for a user.
    ///
    /// Returns the number of notifications that were marked read.
    pub async fn mark_all_read(pool: &PgPool, user_id: DbId) -> Result<u64, sqlx::Error> {
        let result = sqlx::query(
            "UPDATE notifications \
             SET is_read = true, read_at = NOW() \
             WHERE user_id = $1 AND is_read = false",
        )
        .bind(user_id)
        .execute(pool)
        .await?;
        Ok(result.rows_affected())
    }

    /// Get the number of unread notifications for a user.
    pub async fn unread_count(pool: &PgPool, user_id: DbId) -> Result<i64, sqlx::Error> {
        let count: Option<i64> = sqlx::query_scalar(
            "SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND is_read = false",
        )
        .bind(user_id)
        .fetch_one(pool)
        .await?;
        Ok(count.unwrap_or(0))
    }

    /// Mark a notification as delivered.
    pub async fn mark_delivered(pool: &PgPool, notification_id: DbId) -> Result<(), sqlx::Error> {
        sqlx::query(
            "UPDATE notifications \
             SET is_delivered = true, delivered_at = NOW() \
             WHERE id = $1",
        )
        .bind(notification_id)
        .execute(pool)
        .await?;
        Ok(())
    }
}
