//! Durable event persistence service.
//!
//! [`EventPersistence`] subscribes to the [`EventBus`](crate::bus::EventBus)
//! broadcast channel and writes every received [`PlatformEvent`] to the
//! `events` table. It runs as a long-lived background task and shuts down
//! gracefully when the bus sender is dropped.

use tokio::sync::broadcast;
use x121_core::types::DbId;
use x121_db::repositories::EventRepo;
use x121_db::DbPool;

use crate::bus::PlatformEvent;

/// Background service that persists platform events to the database.
pub struct EventPersistence;

impl EventPersistence {
    /// Run the persistence loop.
    ///
    /// Subscribes to the event bus via the provided `receiver` and persists
    /// every event it receives. The loop exits when the channel is closed
    /// (i.e. the [`EventBus`](crate::bus::EventBus) is dropped).
    pub async fn run(pool: DbPool, mut receiver: broadcast::Receiver<PlatformEvent>) {
        loop {
            match receiver.recv().await {
                Ok(event) => {
                    if let Err(e) = Self::persist(&pool, &event).await {
                        tracing::error!(
                            error = %e,
                            event_type = %event.event_type,
                            "Failed to persist event"
                        );
                    }
                }
                Err(broadcast::error::RecvError::Lagged(n)) => {
                    tracing::warn!(
                        skipped = n,
                        "Event persistence lagged, some events were not persisted"
                    );
                }
                Err(broadcast::error::RecvError::Closed) => {
                    tracing::info!("Event bus closed, persistence shutting down");
                    break;
                }
            }
        }
    }

    /// Write a single event to the `events` table.
    ///
    /// Resolves the `event_type` name to its `event_types.id` foreign key
    /// via [`EventRepo`], then inserts a row via [`EventRepo::insert`].
    async fn persist(pool: &DbPool, event: &PlatformEvent) -> Result<DbId, sqlx::Error> {
        let event_type = EventRepo::get_event_type_by_name(pool, &event.event_type)
            .await?
            .ok_or_else(|| sqlx::Error::RowNotFound)?;

        EventRepo::insert(
            pool,
            event_type.id,
            event.source_entity_type.as_deref(),
            event.source_entity_id,
            event.actor_user_id,
            &event.payload,
        )
        .await
    }
}
