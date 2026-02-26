//! Unit tests for `WsManager`.
//!
//! These tests exercise the WebSocket connection manager directly, without
//! performing any HTTP upgrades. They verify add/remove semantics, broadcast
//! delivery, and graceful shutdown behaviour.

use axum::extract::ws::Message;
use x121_api::ws::WsManager;

// ---------------------------------------------------------------------------
// Test: new manager starts with zero connections
// ---------------------------------------------------------------------------

#[tokio::test]
async fn new_manager_has_zero_connections() {
    let manager = WsManager::new();

    assert_eq!(manager.connection_count().await, 0);
}

// ---------------------------------------------------------------------------
// Test: add() increments the connection count
// ---------------------------------------------------------------------------

#[tokio::test]
async fn add_increments_connection_count() {
    let manager = WsManager::new();

    let _rx = manager.add("conn-1".to_string(), None).await;

    assert_eq!(manager.connection_count().await, 1);
}

// ---------------------------------------------------------------------------
// Test: remove() decrements the connection count
// ---------------------------------------------------------------------------

#[tokio::test]
async fn remove_decrements_connection_count() {
    let manager = WsManager::new();

    let _rx = manager.add("conn-1".to_string(), None).await;
    assert_eq!(manager.connection_count().await, 1);

    manager.remove("conn-1").await;
    assert_eq!(manager.connection_count().await, 0);
}

// ---------------------------------------------------------------------------
// Test: remove() with unknown ID is a no-op
// ---------------------------------------------------------------------------

#[tokio::test]
async fn remove_unknown_id_is_noop() {
    let manager = WsManager::new();

    let _rx = manager.add("conn-1".to_string(), None).await;
    manager.remove("nonexistent").await;

    assert_eq!(manager.connection_count().await, 1);
}

// ---------------------------------------------------------------------------
// Test: shutdown_all() sends Close and clears all connections
// ---------------------------------------------------------------------------

#[tokio::test]
async fn shutdown_all_sends_close_and_clears() {
    let manager = WsManager::new();

    let mut rx1 = manager.add("conn-1".to_string(), None).await;
    let mut rx2 = manager.add("conn-2".to_string(), None).await;
    assert_eq!(manager.connection_count().await, 2);

    manager.shutdown_all().await;

    // Connection count should be zero after shutdown.
    assert_eq!(manager.connection_count().await, 0);

    // Both receivers should have received a Close message.
    let msg1 = rx1.recv().await.expect("rx1 should receive Close");
    assert!(
        matches!(msg1, Message::Close(None)),
        "Expected Close(None), got: {msg1:?}"
    );

    let msg2 = rx2.recv().await.expect("rx2 should receive Close");
    assert!(
        matches!(msg2, Message::Close(None)),
        "Expected Close(None), got: {msg2:?}"
    );

    // After Close, the channel should be closed (no more messages).
    assert!(
        rx1.recv().await.is_none(),
        "Channel should be closed after shutdown"
    );
}

// ---------------------------------------------------------------------------
// Test: broadcast() sends message to all connected clients
// ---------------------------------------------------------------------------

#[tokio::test]
async fn broadcast_sends_to_all_connections() {
    let manager = WsManager::new();

    let mut rx1 = manager.add("conn-1".to_string(), None).await;
    let mut rx2 = manager.add("conn-2".to_string(), None).await;
    let mut rx3 = manager.add("conn-3".to_string(), None).await;

    let payload = Message::Text("hello everyone".into());
    manager.broadcast(payload).await;

    // All three receivers should get the same message.
    let msg1 = rx1.recv().await.expect("rx1 should receive broadcast");
    let msg2 = rx2.recv().await.expect("rx2 should receive broadcast");
    let msg3 = rx3.recv().await.expect("rx3 should receive broadcast");

    assert!(matches!(&msg1, Message::Text(t) if *t == "hello everyone"));
    assert!(matches!(&msg2, Message::Text(t) if *t == "hello everyone"));
    assert!(matches!(&msg3, Message::Text(t) if *t == "hello everyone"));
}

// ---------------------------------------------------------------------------
// Test: broadcast() skips closed channels without panicking
// ---------------------------------------------------------------------------

#[tokio::test]
async fn broadcast_skips_closed_channels() {
    let manager = WsManager::new();

    let rx1 = manager.add("conn-1".to_string(), None).await;
    let mut rx2 = manager.add("conn-2".to_string(), None).await;

    // Drop rx1 to close its channel.
    drop(rx1);

    // Broadcast should not panic even though conn-1's channel is closed.
    let payload = Message::Text("still alive".into());
    manager.broadcast(payload).await;

    // conn-2 should still receive the message.
    let msg = rx2.recv().await.expect("rx2 should receive broadcast");
    assert!(matches!(&msg, Message::Text(t) if *t == "still alive"));
}

// ---------------------------------------------------------------------------
// Test: multiple add/remove cycles work correctly
// ---------------------------------------------------------------------------

#[tokio::test]
async fn multiple_add_remove_cycles() {
    let manager = WsManager::new();

    let _rx1 = manager.add("conn-1".to_string(), None).await;
    let _rx2 = manager.add("conn-2".to_string(), None).await;
    assert_eq!(manager.connection_count().await, 2);

    manager.remove("conn-1").await;
    assert_eq!(manager.connection_count().await, 1);

    let _rx3 = manager.add("conn-3".to_string(), None).await;
    assert_eq!(manager.connection_count().await, 2);

    manager.remove("conn-2").await;
    manager.remove("conn-3").await;
    assert_eq!(manager.connection_count().await, 0);
}

// ---------------------------------------------------------------------------
// Test: adding with duplicate ID replaces the previous connection
// ---------------------------------------------------------------------------

#[tokio::test]
async fn duplicate_id_replaces_previous_connection() {
    let manager = WsManager::new();

    let _rx_old = manager.add("conn-1".to_string(), None).await;
    assert_eq!(manager.connection_count().await, 1);

    // Re-add with the same ID -- should replace, not duplicate.
    let mut rx_new = manager.add("conn-1".to_string(), None).await;
    assert_eq!(manager.connection_count().await, 1);

    // Broadcast to verify the new receiver gets the message.
    manager.broadcast(Message::Text("replaced".into())).await;
    let msg = rx_new.recv().await.expect("New rx should receive message");
    assert!(matches!(&msg, Message::Text(t) if *t == "replaced"));
}
