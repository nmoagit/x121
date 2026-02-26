//! Repository for the `webhooks` and `webhook_deliveries` tables (PRD-12).

use sqlx::PgPool;
use x121_core::types::DbId;

use crate::models::api_key::{Webhook, WebhookDelivery};

// ---------------------------------------------------------------------------
// Column lists
// ---------------------------------------------------------------------------

const WEBHOOK_COLUMNS: &str = "\
    id, name, url, secret, event_types, is_enabled, created_by, \
    last_triggered_at, failure_count, created_at, updated_at";

const DELIVERY_COLUMNS: &str = "\
    id, webhook_id, event_id, payload, status, response_status_code, \
    response_body, attempt_count, max_attempts, next_retry_at, \
    delivered_at, created_at, updated_at";

/// Provides CRUD operations for webhooks and webhook deliveries.
pub struct WebhookRepo;

impl WebhookRepo {
    // -----------------------------------------------------------------------
    // Webhook CRUD
    // -----------------------------------------------------------------------

    /// Create a new webhook.
    pub async fn create(
        pool: &PgPool,
        name: &str,
        url: &str,
        secret: Option<&str>,
        event_types: &serde_json::Value,
        is_enabled: bool,
        created_by: DbId,
    ) -> Result<Webhook, sqlx::Error> {
        let query = format!(
            "INSERT INTO webhooks (name, url, secret, event_types, is_enabled, created_by) \
             VALUES ($1, $2, $3, $4, $5, $6) \
             RETURNING {WEBHOOK_COLUMNS}"
        );
        sqlx::query_as::<_, Webhook>(&query)
            .bind(name)
            .bind(url)
            .bind(secret)
            .bind(event_types)
            .bind(is_enabled)
            .bind(created_by)
            .fetch_one(pool)
            .await
    }

    /// List all webhooks ordered by creation date (newest first).
    pub async fn list(pool: &PgPool) -> Result<Vec<Webhook>, sqlx::Error> {
        let query = format!("SELECT {WEBHOOK_COLUMNS} FROM webhooks ORDER BY created_at DESC");
        sqlx::query_as::<_, Webhook>(&query).fetch_all(pool).await
    }

    /// Find a webhook by ID.
    pub async fn find_by_id(pool: &PgPool, id: DbId) -> Result<Option<Webhook>, sqlx::Error> {
        let query = format!("SELECT {WEBHOOK_COLUMNS} FROM webhooks WHERE id = $1");
        sqlx::query_as::<_, Webhook>(&query)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// Update a webhook's settings.
    pub async fn update(
        pool: &PgPool,
        id: DbId,
        name: Option<&str>,
        url: Option<&str>,
        secret: Option<&str>,
        event_types: Option<&serde_json::Value>,
        is_enabled: Option<bool>,
    ) -> Result<Option<Webhook>, sqlx::Error> {
        let query = format!(
            "UPDATE webhooks SET \
                 name = COALESCE($2, name), \
                 url = COALESCE($3, url), \
                 secret = COALESCE($4, secret), \
                 event_types = COALESCE($5, event_types), \
                 is_enabled = COALESCE($6, is_enabled) \
             WHERE id = $1 \
             RETURNING {WEBHOOK_COLUMNS}"
        );
        sqlx::query_as::<_, Webhook>(&query)
            .bind(id)
            .bind(name)
            .bind(url)
            .bind(secret)
            .bind(event_types)
            .bind(is_enabled)
            .fetch_optional(pool)
            .await
    }

    /// Delete a webhook by ID. Cascade deletes all deliveries.
    pub async fn delete(pool: &PgPool, id: DbId) -> Result<bool, sqlx::Error> {
        let result = sqlx::query("DELETE FROM webhooks WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected() > 0)
    }

    // -----------------------------------------------------------------------
    // Delivery operations
    // -----------------------------------------------------------------------

    /// Create a new delivery record (status = 'pending').
    pub async fn create_delivery(
        pool: &PgPool,
        webhook_id: DbId,
        event_id: Option<DbId>,
        payload: &serde_json::Value,
    ) -> Result<WebhookDelivery, sqlx::Error> {
        let query = format!(
            "INSERT INTO webhook_deliveries (webhook_id, event_id, payload) \
             VALUES ($1, $2, $3) \
             RETURNING {DELIVERY_COLUMNS}"
        );
        sqlx::query_as::<_, WebhookDelivery>(&query)
            .bind(webhook_id)
            .bind(event_id)
            .bind(payload)
            .fetch_one(pool)
            .await
    }

    /// List pending deliveries ready for processing.
    ///
    /// Returns deliveries that are pending/retrying, past their retry time,
    /// and under the max attempt count.
    pub async fn list_pending_deliveries(
        pool: &PgPool,
        limit: i64,
    ) -> Result<Vec<WebhookDelivery>, sqlx::Error> {
        let query = format!(
            "SELECT {DELIVERY_COLUMNS} FROM webhook_deliveries \
             WHERE (status = 'pending' OR status = 'retrying') \
               AND (next_retry_at IS NULL OR next_retry_at <= NOW()) \
               AND attempt_count < max_attempts \
             ORDER BY created_at ASC LIMIT $1"
        );
        sqlx::query_as::<_, WebhookDelivery>(&query)
            .bind(limit)
            .fetch_all(pool)
            .await
    }

    /// Mark a delivery as successfully delivered.
    pub async fn mark_delivered(
        pool: &PgPool,
        delivery_id: DbId,
        response_status_code: i16,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(
            "UPDATE webhook_deliveries SET \
                 status = 'delivered', \
                 response_status_code = $2, \
                 delivered_at = NOW() \
             WHERE id = $1",
        )
        .bind(delivery_id)
        .bind(response_status_code)
        .execute(pool)
        .await?;
        Ok(())
    }

    /// Schedule a retry with exponential backoff.
    pub async fn schedule_retry(
        pool: &PgPool,
        delivery_id: DbId,
        response_status_code: i16,
        attempt_count: i16,
        delay_secs: i64,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(
            "UPDATE webhook_deliveries SET \
                 status = CASE WHEN $3 >= max_attempts THEN 'failed' ELSE 'retrying' END, \
                 attempt_count = $3, \
                 response_status_code = $2, \
                 next_retry_at = NOW() + ($4 || ' seconds')::INTERVAL \
             WHERE id = $1",
        )
        .bind(delivery_id)
        .bind(response_status_code)
        .bind(attempt_count)
        .bind(delay_secs.to_string())
        .execute(pool)
        .await?;
        Ok(())
    }

    /// List deliveries for a specific webhook with pagination.
    pub async fn list_deliveries_for_webhook(
        pool: &PgPool,
        webhook_id: DbId,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<WebhookDelivery>, sqlx::Error> {
        let query = format!(
            "SELECT {DELIVERY_COLUMNS} FROM webhook_deliveries \
             WHERE webhook_id = $1 \
             ORDER BY created_at DESC LIMIT $2 OFFSET $3"
        );
        sqlx::query_as::<_, WebhookDelivery>(&query)
            .bind(webhook_id)
            .bind(limit)
            .bind(offset)
            .fetch_all(pool)
            .await
    }

    /// Find a delivery by ID.
    pub async fn find_delivery_by_id(
        pool: &PgPool,
        id: DbId,
    ) -> Result<Option<WebhookDelivery>, sqlx::Error> {
        let query = format!("SELECT {DELIVERY_COLUMNS} FROM webhook_deliveries WHERE id = $1");
        sqlx::query_as::<_, WebhookDelivery>(&query)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// Reset a delivery for replay: set status back to 'pending', clear response data.
    pub async fn replay_delivery(
        pool: &PgPool,
        delivery_id: DbId,
    ) -> Result<Option<WebhookDelivery>, sqlx::Error> {
        let query = format!(
            "UPDATE webhook_deliveries SET \
                 status = 'pending', \
                 attempt_count = 0, \
                 response_status_code = NULL, \
                 response_body = NULL, \
                 next_retry_at = NULL, \
                 delivered_at = NULL \
             WHERE id = $1 \
             RETURNING {DELIVERY_COLUMNS}"
        );
        sqlx::query_as::<_, WebhookDelivery>(&query)
            .bind(delivery_id)
            .fetch_optional(pool)
            .await
    }

    /// Update `last_triggered_at` on a webhook.
    pub async fn touch_triggered(pool: &PgPool, webhook_id: DbId) -> Result<(), sqlx::Error> {
        sqlx::query("UPDATE webhooks SET last_triggered_at = NOW() WHERE id = $1")
            .bind(webhook_id)
            .execute(pool)
            .await?;
        Ok(())
    }

    /// Increment `failure_count` on a webhook.
    pub async fn increment_failure_count(
        pool: &PgPool,
        webhook_id: DbId,
    ) -> Result<(), sqlx::Error> {
        sqlx::query("UPDATE webhooks SET failure_count = failure_count + 1 WHERE id = $1")
            .bind(webhook_id)
            .execute(pool)
            .await?;
        Ok(())
    }
}
