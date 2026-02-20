//! Digest notification scheduler.
//!
//! [`DigestScheduler`] runs as a background task, periodically checking for
//! users whose digest window has elapsed and marking their queued digest
//! notifications as delivered. Actual email/webhook delivery of the aggregated
//! digest summary will be wired in once the job system (PRD-07/08) and SMTP
//! configuration are in place.

use std::time::Duration;

use tokio_util::sync::CancellationToken;
use trulience_core::channels::CHANNEL_DIGEST;
use trulience_db::repositories::{NotificationPreferenceRepo, NotificationRepo};
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
        let due_settings =
            NotificationPreferenceRepo::list_users_due_for_digest(&self.pool).await?;

        for settings in &due_settings {
            if let Err(e) = self.send_digest(settings.user_id).await {
                tracing::error!(
                    user_id = settings.user_id,
                    error = %e,
                    "Failed to send digest for user"
                );
            }
        }

        if !due_settings.is_empty() {
            tracing::info!(count = due_settings.len(), "Processed digest deliveries");
        }

        Ok(())
    }

    /// Deliver a digest for a single user.
    ///
    /// Marks all pending digest notifications as delivered and updates the
    /// last-sent timestamp. The actual aggregation and external delivery
    /// (email/webhook) will be added when SMTP and the job system are
    /// available.
    async fn send_digest(&self, user_id: trulience_core::types::DbId) -> Result<(), sqlx::Error> {
        let count =
            NotificationRepo::pending_count_for_channel(&self.pool, user_id, CHANNEL_DIGEST)
                .await?;

        if count == 0 {
            return Ok(());
        }

        // Mark digest notifications as delivered.
        NotificationRepo::mark_channel_delivered(&self.pool, user_id, CHANNEL_DIGEST).await?;

        // Update last-sent timestamp.
        NotificationPreferenceRepo::mark_digest_sent(&self.pool, user_id).await?;

        tracing::info!(user_id, notification_count = count, "Digest delivered");

        Ok(())
    }
}
