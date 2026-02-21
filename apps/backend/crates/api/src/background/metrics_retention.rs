//! Periodic cleanup of old GPU metrics (PRD-06).
//!
//! Spawns a background task that deletes rows from `gpu_metrics` older than
//! the configured retention period. Runs on a fixed interval using
//! `tokio::time::interval`.

use std::time::Duration;

use chrono::Utc;
use sqlx::PgPool;
use tokio_util::sync::CancellationToken;
use trulience_db::repositories::GpuMetricRepo;

/// Default retention period: 24 hours.
const DEFAULT_RETENTION_HOURS: i64 = 24;

/// How often the cleanup job runs.
const CLEANUP_INTERVAL: Duration = Duration::from_secs(3600); // 1 hour

/// Run the metrics retention cleanup loop.
///
/// Deletes GPU metric rows older than `retention_hours` (defaults to 24).
/// Runs until `cancel` is triggered.
pub async fn run(pool: PgPool, cancel: CancellationToken) {
    let retention_hours: i64 = std::env::var("METRICS_RETENTION_HOURS")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(DEFAULT_RETENTION_HOURS);

    tracing::info!(
        retention_hours,
        interval_secs = CLEANUP_INTERVAL.as_secs(),
        "Metrics retention job started"
    );

    let mut interval = tokio::time::interval(CLEANUP_INTERVAL);

    loop {
        tokio::select! {
            _ = cancel.cancelled() => {
                tracing::info!("Metrics retention job stopping");
                break;
            }
            _ = interval.tick() => {
                let cutoff = Utc::now() - chrono::Duration::hours(retention_hours);
                match GpuMetricRepo::delete_older_than(&pool, cutoff).await {
                    Ok(deleted) => {
                        if deleted > 0 {
                            tracing::info!(deleted, "Metrics retention: purged old rows");
                        } else {
                            tracing::debug!("Metrics retention: no rows to purge");
                        }
                    }
                    Err(e) => {
                        tracing::error!(error = %e, "Metrics retention: cleanup failed");
                    }
                }
            }
        }
    }
}
