//! Background service that persists activity log entries in batches (PRD-118).
//!
//! Subscribes to [`ActivityLogBroadcaster`], buffers entries, and flushes
//! them to the database when either `batch_size` is reached or
//! `flush_interval` elapses.

use std::collections::HashMap;
use std::time::Duration;

use tokio::sync::broadcast;
use tokio_util::sync::CancellationToken;
use x121_core::activity::ActivityLogEntry;
use x121_db::repositories::ActivityLogRepo;
use x121_db::DbPool;

use crate::background::activity_persistence::entry_to_create::entry_to_create_log;

/// Run the activity log persistence loop.
///
/// Buffers incoming entries and flushes to the database when either:
/// - Buffer reaches `batch_size` entries, or
/// - `flush_interval` elapses since last flush.
pub async fn run(
    pool: DbPool,
    mut receiver: broadcast::Receiver<ActivityLogEntry>,
    cancel: CancellationToken,
    batch_size: usize,
    flush_interval: Duration,
) {
    // Cache level and source ID lookups at startup.
    let level_map = match build_level_map(&pool).await {
        Ok(m) => m,
        Err(e) => {
            tracing::error!(error = %e, "Failed to load activity_log_levels, aborting persistence");
            return;
        }
    };
    let source_map = match build_source_map(&pool).await {
        Ok(m) => m,
        Err(e) => {
            tracing::error!(error = %e, "Failed to load activity_log_sources, aborting persistence");
            return;
        }
    };

    tracing::info!(
        batch_size,
        flush_interval_ms = flush_interval.as_millis() as u64,
        "Activity log persistence started"
    );

    let mut buffer: Vec<ActivityLogEntry> = Vec::with_capacity(batch_size * 2);
    let mut interval = tokio::time::interval(flush_interval);
    let max_buffer = batch_size * 10;

    loop {
        tokio::select! {
            _ = cancel.cancelled() => {
                tracing::info!("Activity log persistence stopping, flushing remaining buffer");
                flush(&pool, &mut buffer, &level_map, &source_map).await;
                break;
            }
            _ = interval.tick() => {
                if !buffer.is_empty() {
                    flush(&pool, &mut buffer, &level_map, &source_map).await;
                }
            }
            result = receiver.recv() => {
                match result {
                    Ok(entry) => {
                        buffer.push(entry);

                        // Backpressure: drop oldest verbose entries when overloaded.
                        if buffer.len() > max_buffer {
                            let before = buffer.len();
                            buffer.retain(|e| {
                                e.category == x121_core::activity::ActivityLogCategory::Curated
                            });
                            let dropped = before - buffer.len();
                            if dropped > 0 {
                                tracing::warn!(
                                    dropped,
                                    "Activity log persistence: dropped verbose entries due to backpressure"
                                );
                            }
                        }

                        if buffer.len() >= batch_size {
                            flush(&pool, &mut buffer, &level_map, &source_map).await;
                        }
                    }
                    Err(broadcast::error::RecvError::Lagged(n)) => {
                        tracing::warn!(
                            skipped = n,
                            "Activity log persistence lagged, some entries were dropped"
                        );
                    }
                    Err(broadcast::error::RecvError::Closed) => {
                        tracing::info!("Activity log broadcaster closed, flushing and shutting down");
                        flush(&pool, &mut buffer, &level_map, &source_map).await;
                        break;
                    }
                }
            }
        }
    }
}

/// Flush the buffer to the database.
async fn flush(
    pool: &DbPool,
    buffer: &mut Vec<ActivityLogEntry>,
    level_map: &HashMap<String, i16>,
    source_map: &HashMap<String, i16>,
) {
    if buffer.is_empty() {
        return;
    }

    let entries: Vec<_> = buffer
        .drain(..)
        .filter_map(|e| entry_to_create_log(&e, level_map, source_map))
        .collect();

    if entries.is_empty() {
        return;
    }

    let count = entries.len();
    let start = std::time::Instant::now();

    match ActivityLogRepo::batch_insert(pool, &entries).await {
        Ok(rows) => {
            tracing::debug!(
                flushed = rows,
                elapsed_ms = start.elapsed().as_millis() as u64,
                "Activity log persistence: batch flushed"
            );
        }
        Err(e) => {
            tracing::error!(
                error = %e,
                lost_entries = count,
                "Activity log persistence: batch insert failed"
            );
        }
    }
}

/// Build the level name → id lookup cache.
async fn build_level_map(pool: &DbPool) -> Result<HashMap<String, i16>, sqlx::Error> {
    let rows = ActivityLogRepo::list_levels(pool).await?;
    Ok(rows.into_iter().map(|r| (r.name, r.id)).collect())
}

/// Build the source name → id lookup cache.
async fn build_source_map(pool: &DbPool) -> Result<HashMap<String, i16>, sqlx::Error> {
    let rows = ActivityLogRepo::list_sources(pool).await?;
    Ok(rows.into_iter().map(|r| (r.name, r.id)).collect())
}

/// Conversion helper module.
mod entry_to_create {
    use std::collections::HashMap;
    use x121_core::activity::ActivityLogEntry;
    use x121_db::models::activity_log::CreateActivityLog;

    /// Convert an in-memory `ActivityLogEntry` to a `CreateActivityLog` DTO.
    pub fn entry_to_create_log(
        entry: &ActivityLogEntry,
        level_map: &HashMap<String, i16>,
        source_map: &HashMap<String, i16>,
    ) -> Option<CreateActivityLog> {
        let level_id = *level_map.get(entry.level.as_str())?;
        let source_id = *source_map.get(entry.source.as_str())?;

        Some(CreateActivityLog {
            level_id,
            source_id,
            message: entry.message.clone(),
            fields: entry.fields.clone(),
            category: entry.category.as_str().to_string(),
            entity_type: entry.entity_type.clone(),
            entity_id: entry.entity_id,
            user_id: entry.user_id,
            job_id: entry.job_id,
            project_id: entry.project_id,
            trace_id: entry.trace_id.clone(),
        })
    }
}
