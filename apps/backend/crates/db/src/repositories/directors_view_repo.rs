//! Repository for `push_subscriptions` and `offline_sync_log` tables (PRD-55).
//!
//! Provides data access for push notification subscription management
//! and offline sync action recording and retrieval.

use sqlx::PgPool;
use x121_core::types::DbId;

use crate::models::directors_view::{OfflineSyncAction, PushSubscription};

// ---------------------------------------------------------------------------
// Column constants
// ---------------------------------------------------------------------------

/// Column list for `push_subscriptions` queries.
const PUSH_SUB_COLUMNS: &str =
    "id, user_id, endpoint, p256dh_key, auth_key, user_agent, created_at, updated_at";

/// Column list for `offline_sync_log` queries.
const SYNC_LOG_COLUMNS: &str = "id, user_id, action_type, target_id, payload_json, \
    synced, synced_at, client_timestamp, created_at";

// ---------------------------------------------------------------------------
// PushSubscriptionRepo
// ---------------------------------------------------------------------------

/// Data access for push notification subscriptions.
pub struct PushSubscriptionRepo;

impl PushSubscriptionRepo {
    /// Create a new push subscription or update if the user+endpoint pair
    /// already exists.
    pub async fn create_or_update(
        pool: &PgPool,
        user_id: DbId,
        endpoint: &str,
        p256dh_key: &str,
        auth_key: &str,
        user_agent: Option<&str>,
    ) -> Result<PushSubscription, sqlx::Error> {
        let query = format!(
            "INSERT INTO push_subscriptions
                (user_id, endpoint, p256dh_key, auth_key, user_agent)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (user_id, endpoint) DO UPDATE SET
                p256dh_key = EXCLUDED.p256dh_key,
                auth_key = EXCLUDED.auth_key,
                user_agent = EXCLUDED.user_agent
             RETURNING {PUSH_SUB_COLUMNS}"
        );
        sqlx::query_as::<_, PushSubscription>(&query)
            .bind(user_id)
            .bind(endpoint)
            .bind(p256dh_key)
            .bind(auth_key)
            .bind(user_agent)
            .fetch_one(pool)
            .await
    }

    /// List all push subscriptions for a user.
    pub async fn list_by_user(
        pool: &PgPool,
        user_id: DbId,
    ) -> Result<Vec<PushSubscription>, sqlx::Error> {
        let query = format!(
            "SELECT {PUSH_SUB_COLUMNS} FROM push_subscriptions
             WHERE user_id = $1
             ORDER BY created_at DESC"
        );
        sqlx::query_as::<_, PushSubscription>(&query)
            .bind(user_id)
            .fetch_all(pool)
            .await
    }

    /// Delete a push subscription by endpoint for a specific user.
    ///
    /// Returns `true` if a row was deleted.
    pub async fn delete_by_endpoint(
        pool: &PgPool,
        user_id: DbId,
        endpoint: &str,
    ) -> Result<bool, sqlx::Error> {
        let result =
            sqlx::query("DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2")
                .bind(user_id)
                .bind(endpoint)
                .execute(pool)
                .await?;
        Ok(result.rows_affected() > 0)
    }

    /// Delete all push subscriptions for a user.
    ///
    /// Returns the number of rows deleted.
    pub async fn delete_all_for_user(pool: &PgPool, user_id: DbId) -> Result<u64, sqlx::Error> {
        let result = sqlx::query("DELETE FROM push_subscriptions WHERE user_id = $1")
            .bind(user_id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected())
    }
}

// ---------------------------------------------------------------------------
// OfflineSyncRepo
// ---------------------------------------------------------------------------

/// Data access for offline sync actions.
pub struct OfflineSyncRepo;

impl OfflineSyncRepo {
    /// Create multiple offline sync actions in a single batch.
    ///
    /// Returns the created rows.
    pub async fn create_batch(
        pool: &PgPool,
        user_id: DbId,
        actions: &[(
            DbId,
            &str,
            chrono::DateTime<chrono::Utc>,
            Option<&serde_json::Value>,
        )],
    ) -> Result<Vec<OfflineSyncAction>, sqlx::Error> {
        if actions.is_empty() {
            return Ok(vec![]);
        }

        let mut results = Vec::with_capacity(actions.len());
        let query = format!(
            "INSERT INTO offline_sync_log
                (user_id, action_type, target_id, client_timestamp, payload_json)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING {SYNC_LOG_COLUMNS}"
        );

        for (target_id, action_type, client_ts, payload) in actions {
            let row = sqlx::query_as::<_, OfflineSyncAction>(&query)
                .bind(user_id)
                .bind(action_type)
                .bind(target_id)
                .bind(client_ts)
                .bind(payload)
                .fetch_one(pool)
                .await?;
            results.push(row);
        }

        Ok(results)
    }

    /// List unsynced actions for a user.
    pub async fn list_unsynced(
        pool: &PgPool,
        user_id: DbId,
    ) -> Result<Vec<OfflineSyncAction>, sqlx::Error> {
        let query = format!(
            "SELECT {SYNC_LOG_COLUMNS} FROM offline_sync_log
             WHERE user_id = $1 AND synced = false
             ORDER BY client_timestamp ASC"
        );
        sqlx::query_as::<_, OfflineSyncAction>(&query)
            .bind(user_id)
            .fetch_all(pool)
            .await
    }

    /// Mark a set of offline sync actions as synced.
    pub async fn mark_synced(pool: &PgPool, ids: &[DbId]) -> Result<u64, sqlx::Error> {
        if ids.is_empty() {
            return Ok(0);
        }
        let result = sqlx::query(
            "UPDATE offline_sync_log SET synced = true, synced_at = NOW()
             WHERE id = ANY($1::BIGINT[])",
        )
        .bind(ids)
        .execute(pool)
        .await?;
        Ok(result.rows_affected())
    }

    /// List the most recent sync actions for a user, regardless of sync status.
    pub async fn list_recent(
        pool: &PgPool,
        user_id: DbId,
        limit: i64,
    ) -> Result<Vec<OfflineSyncAction>, sqlx::Error> {
        let query = format!(
            "SELECT {SYNC_LOG_COLUMNS} FROM offline_sync_log
             WHERE user_id = $1
             ORDER BY created_at DESC
             LIMIT $2"
        );
        sqlx::query_as::<_, OfflineSyncAction>(&query)
            .bind(user_id)
            .bind(limit)
            .fetch_all(pool)
            .await
    }
}
