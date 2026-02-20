//! In-process event bus backed by a `tokio::sync::broadcast` channel.
//!
//! [`EventBus`] is the central publish/subscribe hub for [`PlatformEvent`]s.
//! It is designed to be shared via `Arc<EventBus>` across the application.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use tokio::sync::broadcast;
use trulience_core::types::DbId;

// ---------------------------------------------------------------------------
// PlatformEvent
// ---------------------------------------------------------------------------

/// A domain event that occurred on the platform.
///
/// Constructed via [`PlatformEvent::new`] and enriched with the builder
/// methods [`with_source`](PlatformEvent::with_source),
/// [`with_actor`](PlatformEvent::with_actor), and
/// [`with_payload`](PlatformEvent::with_payload).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlatformEvent {
    /// Dot-separated event name, e.g. `"project.published"`.
    pub event_type: String,

    /// Optional source entity kind (e.g. `"project"`, `"scene"`).
    pub source_entity_type: Option<String>,

    /// Optional source entity database id.
    pub source_entity_id: Option<DbId>,

    /// Optional id of the user that triggered the event.
    pub actor_user_id: Option<DbId>,

    /// Free-form JSON payload carrying event-specific data.
    pub payload: serde_json::Value,

    /// When the event was created (UTC).
    pub timestamp: DateTime<Utc>,
}

impl PlatformEvent {
    /// Create a new event with only the required `event_type`.
    ///
    /// All optional fields default to `None` / empty object.
    pub fn new(event_type: impl Into<String>) -> Self {
        Self {
            event_type: event_type.into(),
            source_entity_type: None,
            source_entity_id: None,
            actor_user_id: None,
            payload: serde_json::Value::Object(Default::default()),
            timestamp: Utc::now(),
        }
    }

    /// Attach a source entity to the event.
    pub fn with_source(mut self, entity_type: impl Into<String>, entity_id: DbId) -> Self {
        self.source_entity_type = Some(entity_type.into());
        self.source_entity_id = Some(entity_id);
        self
    }

    /// Attach the acting user to the event.
    pub fn with_actor(mut self, user_id: DbId) -> Self {
        self.actor_user_id = Some(user_id);
        self
    }

    /// Set the JSON payload for the event.
    pub fn with_payload(mut self, payload: serde_json::Value) -> Self {
        self.payload = payload;
        self
    }
}

// ---------------------------------------------------------------------------
// EventBus
// ---------------------------------------------------------------------------

/// Default buffer capacity for the broadcast channel.
const DEFAULT_CAPACITY: usize = 1024;

/// In-process fan-out event bus.
///
/// Wraps a [`broadcast::Sender`] so that any number of subscribers can
/// independently receive every published [`PlatformEvent`].
///
/// # Usage
///
/// ```rust
/// use trulience_events::bus::{EventBus, PlatformEvent};
///
/// let bus = EventBus::default();
/// let mut rx = bus.subscribe();
///
/// bus.publish(PlatformEvent::new("project.created"));
/// ```
pub struct EventBus {
    sender: broadcast::Sender<PlatformEvent>,
}

impl EventBus {
    /// Create a bus with a specific channel capacity.
    ///
    /// When the buffer is full, the oldest un-consumed messages are dropped
    /// and slow receivers will observe a `RecvError::Lagged`.
    pub fn new(capacity: usize) -> Self {
        let (sender, _) = broadcast::channel(capacity);
        Self { sender }
    }

    /// Publish an event to all current subscribers.
    ///
    /// If there are no active subscribers the event is silently dropped.
    /// The persistence layer (when subscribed) ensures database capture.
    pub fn publish(&self, event: PlatformEvent) {
        // Ignore the SendError — it only means there are zero receivers.
        let _ = self.sender.send(event);
    }

    /// Subscribe to all events published on this bus.
    pub fn subscribe(&self) -> broadcast::Receiver<PlatformEvent> {
        self.sender.subscribe()
    }
}

impl Default for EventBus {
    fn default() -> Self {
        Self::new(DEFAULT_CAPACITY)
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn publish_and_receive_single_subscriber() {
        let bus = EventBus::default();
        let mut rx = bus.subscribe();

        let event = PlatformEvent::new("test.created")
            .with_source("widget", 42)
            .with_actor(7)
            .with_payload(serde_json::json!({"key": "value"}));

        bus.publish(event);

        let received = rx.recv().await.expect("should receive the event");
        assert_eq!(received.event_type, "test.created");
        assert_eq!(received.source_entity_type.as_deref(), Some("widget"));
        assert_eq!(received.source_entity_id, Some(42));
        assert_eq!(received.actor_user_id, Some(7));
        assert_eq!(received.payload["key"], "value");
    }

    #[tokio::test]
    async fn multiple_subscribers_receive_same_event() {
        let bus = EventBus::default();
        let mut rx1 = bus.subscribe();
        let mut rx2 = bus.subscribe();

        bus.publish(PlatformEvent::new("multi.test"));

        let e1 = rx1.recv().await.expect("subscriber 1 should receive");
        let e2 = rx2.recv().await.expect("subscriber 2 should receive");

        assert_eq!(e1.event_type, "multi.test");
        assert_eq!(e2.event_type, "multi.test");
    }

    #[test]
    fn publish_with_no_subscribers_does_not_panic() {
        let bus = EventBus::default();
        // No subscribers — this must not panic.
        bus.publish(PlatformEvent::new("orphan.event"));
    }

    #[test]
    fn default_event_has_empty_optional_fields() {
        let event = PlatformEvent::new("bare.event");
        assert_eq!(event.event_type, "bare.event");
        assert!(event.source_entity_type.is_none());
        assert!(event.source_entity_id.is_none());
        assert!(event.actor_user_id.is_none());
        assert!(event.payload.is_object());
    }
}
