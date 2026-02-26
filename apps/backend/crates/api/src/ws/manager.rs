use std::collections::HashMap;

use axum::body::Bytes;
use axum::extract::ws::Message;
use tokio::sync::{mpsc, RwLock};
use x121_core::types::{DbId, Timestamp};

/// Channel sender half for pushing messages to a WebSocket connection.
pub type WsSender = mpsc::UnboundedSender<Message>;

/// Metadata for a single WebSocket connection.
pub struct WsConnection {
    /// Authenticated user ID, if the connection has been authenticated.
    /// Set after authentication (PRD-03).
    pub user_id: Option<DbId>,
    /// Channel sender for outbound messages to this connection.
    pub sender: WsSender,
    /// When this connection was established.
    /// Used by connection management and monitoring (PRD-09).
    pub connected_at: Timestamp,
}

/// Manages all active WebSocket connections.
///
/// Thread-safe via interior `RwLock`; designed to be wrapped in `Arc` and
/// shared across the application.
pub struct WsManager {
    connections: RwLock<HashMap<String, WsConnection>>,
}

impl WsManager {
    /// Create a new, empty connection manager.
    pub fn new() -> Self {
        Self {
            connections: RwLock::new(HashMap::new()),
        }
    }

    /// Register a new connection.
    ///
    /// Returns the receiver half of the message channel so the caller can
    /// forward messages to the WebSocket sink.
    pub async fn add(
        &self,
        conn_id: String,
        user_id: Option<DbId>,
    ) -> mpsc::UnboundedReceiver<Message> {
        let (tx, rx) = mpsc::unbounded_channel();
        let conn = WsConnection {
            user_id,
            sender: tx,
            connected_at: chrono::Utc::now(),
        };
        self.connections.write().await.insert(conn_id, conn);
        rx
    }

    /// Remove a connection by its ID.
    pub async fn remove(&self, conn_id: &str) {
        self.connections.write().await.remove(conn_id);
    }

    /// Find all connection IDs associated with a given user.
    /// Used by authenticated messaging handlers (PRD-03+).
    pub async fn get_by_user(&self, user_id: DbId) -> Vec<String> {
        self.connections
            .read()
            .await
            .iter()
            .filter_map(|(id, conn)| {
                if conn.user_id == Some(user_id) {
                    Some(id.clone())
                } else {
                    None
                }
            })
            .collect()
    }

    /// Broadcast a message to all connected clients.
    ///
    /// Connections whose send channels are closed are silently skipped
    /// (they will be cleaned up on their next receive loop iteration).
    /// Used by real-time event broadcasting (PRD-07+).
    pub async fn broadcast(&self, message: Message) {
        let conns = self.connections.read().await;
        for conn in conns.values() {
            let _ = conn.sender.send(message.clone());
        }
    }

    /// Send a message to all connections belonging to a specific user.
    ///
    /// Returns the number of connections the message was sent to.
    pub async fn send_to_user(&self, user_id: DbId, message: Message) -> usize {
        let conns = self.connections.read().await;
        let mut count = 0;
        for conn in conns.values() {
            if conn.user_id == Some(user_id) {
                let _ = conn.sender.send(message.clone());
                count += 1;
            }
        }
        count
    }

    /// Return the current number of active connections.
    pub async fn connection_count(&self) -> usize {
        self.connections.read().await.len()
    }

    /// Send a Close frame to every connection, then clear the map.
    ///
    /// Used during graceful shutdown to notify all clients before the
    /// server stops accepting new connections.
    pub async fn shutdown_all(&self) {
        let mut conns = self.connections.write().await;
        let count = conns.len();
        for conn in conns.values() {
            let _ = conn.sender.send(Message::Close(None));
        }
        conns.clear();
        tracing::info!(count, "Closed all WebSocket connections");
    }

    /// Send a Ping frame to every connected client.
    ///
    /// Used by the heartbeat task to keep connections alive and detect
    /// stale ones.
    pub async fn ping_all(&self) {
        let conns = self.connections.read().await;
        for conn in conns.values() {
            let _ = conn.sender.send(Message::Ping(Bytes::new()));
        }
    }
}

impl Default for WsManager {
    fn default() -> Self {
        Self::new()
    }
}
