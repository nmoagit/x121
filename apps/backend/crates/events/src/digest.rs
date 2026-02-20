//! Digest notification scheduler.
//!
//! [`DigestScheduler`] runs as a background task, periodically checking for
//! users whose digest window has elapsed and marking their queued digest
//! notifications as delivered. Actual email/webhook delivery of the aggregated
//! digest summary will be wired in once the job system (PRD-07/08) and SMTP
//! configuration are in place.

use std::time::Duration;

use tokio_util::sync::CancellationToken;
use trulience_core::types::DbId;
use trulience_db::DbPool;

/// How often the scheduler polls for due digests.
const DIGEST_CHECK_INTERVAL: Duration = Duration::from_secs(3600);

// ---------------------------------------------------------------------------
// DigestScheduler
// ---------------------------------------------------------------------------

/// Background service that processes digest notifications on a periodic basis.
pub struct DigestScheduler {
    pool: DbPool,
}

impl DigestScheduler {
    /// Create a new scheduler with the given database pool.
    pub fn new(pool: DbPool) -> Self {
        Self { pool }
    }

    /// Run the digest scheduler loop.
    ///
    /// Checks every hour for users due for digest delivery. The loop exits
    /// gracefully when the provided [`CancellationToken`] is cancelled.
    pub async fn run(&self, cancel: CancellationToken) {
        let mut interval = tokio::time::interval(DIGEST_CHECK_INTERVAL);

        loop {
            tokio::select! {
                _ = cancel.cancelled() => {
                    tracing::info!("Digest scheduler cancelled");
                    break;
                }
                _ = interval.tick() => {
                    if let Err(e) = self.process_digests().await {
                        tracing::error!(error = %e, "Failed to process digests");
                    }
                }
            }
        }
    }

    /// Find all users due for a digest and process each one.
    async fn process_digests(&self) -> Result<(), sqlx::Error> {
        let due_users: Vec<(DbId,)> = sqlx::query_as(
            "SELECT user_id FROM user_notification_settings \
             WHERE digest_enabled = true \
             AND (digest_last_sent_at IS NULL \
                  OR (digest_interval = 'hourly' AND digest_last_sent_at < NOW() - INTERVAL '1 hour') \
                  OR (digest_interval = 'daily' AND digest_last_sent_at < NOW() - INTERVAL '1 day'))",
        )
        .fetch_all(&self.pool)
        .await?;

        for (user_id,) in &due_users {
            if let Err(e) = self.send_digest(*user_id).await {
                tracing::error!(user_id, error = %e, "Failed to send digest for user");
            }
        }

        if !due_users.is_empty() {
            tracing::info!(count = due_users.len(), "Processed digest deliveries");
        }

        Ok(())
    }

    /// Deliver a digest for a single user.
    ///
    /// Marks all pending digest notifications as delivered and updates the
    /// last-sent timestamp. The actual aggregation and external delivery
    /// (email/webhook) will be added when SMTP and the job system are
    /// available.
    async fn send_digest(&self, user_id: DbId) -> Result<(), sqlx::Error> {
        let count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM notifications \
             WHERE user_id = $1 AND is_delivered = false AND channel = 'digest'",
        )
        .bind(user_id)
        .fetch_one(&self.pool)
        .await?;

        if count == 0 {
            return Ok(());
        }

        // Mark digest notifications as delivered.
        sqlx::query(
            "UPDATE notifications SET is_delivered = true, delivered_at = NOW() \
             WHERE user_id = $1 AND is_delivered = false AND channel = 'digest'",
        )
        .bind(user_id)
        .execute(&self.pool)
        .await?;

        // Update last-sent timestamp.
        sqlx::query(
            "UPDATE user_notification_settings SET digest_last_sent_at = NOW() \
             WHERE user_id = $1",
        )
        .bind(user_id)
        .execute(&self.pool)
        .await?;

        tracing::info!(user_id, notification_count = count, "Digest delivered");

        Ok(())
    }
}
