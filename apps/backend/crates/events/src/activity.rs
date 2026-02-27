//! In-process broadcast channel for activity log entries (PRD-118).
//!
//! [`ActivityLogBroadcaster`] is the pub/sub hub for [`ActivityLogEntry`]s,
//! following the same pattern as [`EventBus`](crate::bus::EventBus) but
//! carrying activity log entries instead of platform events.

use tokio::sync::broadcast;
use x121_core::activity::ActivityLogEntry;

/// Default buffer capacity — higher than `EventBus` (1024) since activity
/// logs are higher volume.
const DEFAULT_CAPACITY: usize = 4096;

/// In-process broadcast channel for activity log entries.
///
/// Similar to [`EventBus`](crate::bus::EventBus) but carries
/// [`ActivityLogEntry`] instead of [`PlatformEvent`].
pub struct ActivityLogBroadcaster {
    sender: broadcast::Sender<ActivityLogEntry>,
}

impl ActivityLogBroadcaster {
    /// Create a broadcaster with a specific channel capacity.
    pub fn new(capacity: usize) -> Self {
        let (sender, _) = broadcast::channel(capacity);
        Self { sender }
    }

    /// Publish an activity log entry to all current subscribers.
    ///
    /// Silently drops the entry if there are no active subscribers.
    pub fn publish(&self, entry: ActivityLogEntry) {
        let _ = self.sender.send(entry);
    }

    /// Subscribe to all activity log entries published on this broadcaster.
    pub fn subscribe(&self) -> broadcast::Receiver<ActivityLogEntry> {
        self.sender.subscribe()
    }
}

impl Default for ActivityLogBroadcaster {
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
    use x121_core::activity::{ActivityLogLevel, ActivityLogSource};

    #[tokio::test]
    async fn publish_and_receive_single_subscriber() {
        let broadcaster = ActivityLogBroadcaster::default();
        let mut rx = broadcaster.subscribe();

        let entry = ActivityLogEntry::curated(
            ActivityLogLevel::Info,
            ActivityLogSource::Api,
            "test activity",
        );
        broadcaster.publish(entry);

        let received = rx.recv().await.expect("should receive the entry");
        assert_eq!(received.message, "test activity");
        assert_eq!(received.level, ActivityLogLevel::Info);
    }

    #[tokio::test]
    async fn multiple_subscribers_receive_same_entry() {
        let broadcaster = ActivityLogBroadcaster::default();
        let mut rx1 = broadcaster.subscribe();
        let mut rx2 = broadcaster.subscribe();

        broadcaster.publish(ActivityLogEntry::curated(
            ActivityLogLevel::Warn,
            ActivityLogSource::Comfyui,
            "multi-sub test",
        ));

        let e1 = rx1.recv().await.expect("subscriber 1 should receive");
        let e2 = rx2.recv().await.expect("subscriber 2 should receive");

        assert_eq!(e1.message, "multi-sub test");
        assert_eq!(e2.message, "multi-sub test");
    }

    #[test]
    fn publish_with_no_subscribers_does_not_panic() {
        let broadcaster = ActivityLogBroadcaster::default();
        broadcaster.publish(ActivityLogEntry::curated(
            ActivityLogLevel::Debug,
            ActivityLogSource::Pipeline,
            "orphan entry",
        ));
    }
}
