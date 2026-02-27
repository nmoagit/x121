//! Periodic cleanup of old activity log entries (PRD-118).
//!
//! Runs on a 1-hour interval and deletes entries older than the configured
//! retention period, per level. Follows the `metrics_retention.rs` pattern.

use std::time::Duration;

use chrono::Utc;
use sqlx::PgPool;
use tokio_util::sync::CancellationToken;
use x121_db::repositories::{ActivityLogRepo, ActivityLogSettingsRepo};

/// How often the cleanup job runs.
const CLEANUP_INTERVAL: Duration = Duration::from_secs(3600); // 1 hour

/// Default retention days per level (used if settings row is missing).
const DEFAULT_RETENTION_DEBUG: i64 = 7;
const DEFAULT_RETENTION_INFO: i64 = 30;
const DEFAULT_RETENTION_WARN: i64 = 30;
const DEFAULT_RETENTION_ERROR: i64 = 90;

/// Run the activity log retention cleanup loop.
///
/// Deletes activity log entries older than the configured retention period
/// for each level. Runs until `cancel` is triggered.
pub async fn run(pool: PgPool, cancel: CancellationToken) {
    tracing::info!(
        interval_secs = CLEANUP_INTERVAL.as_secs(),
        "Activity log retention job started"
    );

    let mut interval = tokio::time::interval(CLEANUP_INTERVAL);

    loop {
        tokio::select! {
            _ = cancel.cancelled() => {
                tracing::info!("Activity log retention job stopping");
                break;
            }
            _ = interval.tick() => {
                run_cleanup(&pool).await;
            }
        }
    }
}

/// Perform one cleanup cycle: read settings, delete old entries per level.
async fn run_cleanup(pool: &PgPool) {
    // Load current retention settings.
    let (debug_days, info_days, warn_days, error_days) =
        match ActivityLogSettingsRepo::get(pool).await {
            Ok(settings) => (
                settings.retention_days_debug as i64,
                settings.retention_days_info as i64,
                settings.retention_days_warn as i64,
                settings.retention_days_error as i64,
            ),
            Err(e) => {
                tracing::warn!(
                    error = %e,
                    "Activity log retention: failed to load settings, using defaults"
                );
                (
                    DEFAULT_RETENTION_DEBUG,
                    DEFAULT_RETENTION_INFO,
                    DEFAULT_RETENTION_WARN,
                    DEFAULT_RETENTION_ERROR,
                )
            }
        };

    // Level IDs match the seed data: debug=1, info=2, warn=3, error=4.
    let levels: &[(i16, &str, i64)] = &[
        (1, "debug", debug_days),
        (2, "info", info_days),
        (3, "warn", warn_days),
        (4, "error", error_days),
    ];

    for &(level_id, level_name, retention_days) in levels {
        let cutoff = Utc::now() - chrono::Duration::days(retention_days);
        match ActivityLogRepo::delete_older_than(pool, level_id, cutoff).await {
            Ok(deleted) => {
                if deleted > 0 {
                    tracing::info!(
                        deleted,
                        level = level_name,
                        retention_days,
                        "Activity log retention: purged old entries"
                    );
                }
            }
            Err(e) => {
                tracing::error!(
                    error = %e,
                    level = level_name,
                    "Activity log retention: cleanup failed"
                );
            }
        }
    }
}
