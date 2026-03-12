//! Lightweight helper for writing generation log entries.
//!
//! Wraps the repository call so pipeline modules can log with a single
//! function call. Fire-and-forget: errors are traced but never propagated
//! to avoid disrupting the generation pipeline.
//!
//! Optionally also publishes to the activity broadcaster (if initialised
//! via [`init_broadcaster`]) so entries appear in the live activity console.

use std::sync::{Arc, OnceLock};

use sqlx::PgPool;
use x121_core::activity::{ActivityLogEntry, ActivityLogLevel, ActivityLogSource};
use x121_core::types::DbId;
use x121_db::models::scene_generation_log::CreateGenerationLog;
use x121_db::repositories::SceneGenerationLogRepo;
use x121_events::ActivityLogBroadcaster;

/// Module-level broadcaster, set once at startup.
static BROADCASTER: OnceLock<Arc<ActivityLogBroadcaster>> = OnceLock::new();

/// Initialise the global broadcaster so gen_log entries are also
/// published to the live activity console. Call once at startup.
pub fn init_broadcaster(broadcaster: Arc<ActivityLogBroadcaster>) {
    let _ = BROADCASTER.set(broadcaster);
}

/// Map gen_log level strings to activity log levels.
fn to_activity_level(level: &str) -> ActivityLogLevel {
    match level {
        "error" => ActivityLogLevel::Error,
        "warn" => ActivityLogLevel::Warn,
        "success" | "info" => ActivityLogLevel::Info,
        _ => ActivityLogLevel::Info,
    }
}

/// Log a generation event for a scene.
///
/// Fire-and-forget — errors are traced but not propagated.
pub async fn log(pool: &PgPool, scene_id: DbId, level: &str, message: impl Into<String>) {
    log_with_meta(pool, scene_id, level, message, None).await;
}

/// Log a generation event with optional metadata.
pub async fn log_with_meta(
    pool: &PgPool,
    scene_id: DbId,
    level: &str,
    message: impl Into<String>,
    metadata: Option<serde_json::Value>,
) {
    let message = message.into();

    // Publish to activity broadcaster if available.
    if let Some(broadcaster) = BROADCASTER.get() {
        broadcaster.publish(
            ActivityLogEntry::curated(
                to_activity_level(level),
                ActivityLogSource::Worker,
                message.clone(),
            )
            .with_entity("scene", scene_id),
        );
    }

    let input = CreateGenerationLog {
        scene_id,
        level: level.to_string(),
        message,
        metadata,
    };
    if let Err(e) = SceneGenerationLogRepo::insert(pool, &input).await {
        tracing::warn!(scene_id, error = %e, "Failed to write generation log entry");
    }
}
