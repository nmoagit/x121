use std::sync::Arc;
use std::time::Duration;

use crate::ws::manager::WsManager;

/// Interval between heartbeat pings (in seconds).
const HEARTBEAT_INTERVAL_SECS: u64 = 30;

/// Spawn a background task that sends periodic Ping frames to all connected
/// WebSocket clients.
///
/// The task runs until the provided `WsManager` is dropped (which happens
/// during shutdown). The returned `JoinHandle` can be used to abort the task
/// explicitly if needed.
pub fn start_heartbeat(ws_manager: Arc<WsManager>) -> tokio::task::JoinHandle<()> {
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_secs(HEARTBEAT_INTERVAL_SECS));

        loop {
            interval.tick().await;
            let count = ws_manager.connection_count().await;
            tracing::debug!(count, "WebSocket heartbeat ping");
            ws_manager.ping_all().await;
        }
    })
}
