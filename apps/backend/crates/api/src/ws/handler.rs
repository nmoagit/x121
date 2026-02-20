use std::sync::Arc;

use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::State;
use axum::response::IntoResponse;
use futures::{SinkExt, StreamExt};

use crate::state::AppState;
use crate::ws::manager::WsManager;

/// HTTP handler that upgrades the connection to WebSocket.
///
/// After the upgrade the connection is registered with `WsManager` and
/// managed by two spawned tasks (sender + receiver).
pub async fn ws_handler(ws: WebSocketUpgrade, State(state): State<AppState>) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_socket(socket, state.ws_manager))
}

/// Manage a single WebSocket connection after upgrade.
///
/// Splits the socket into a sink (outbound) and stream (inbound), then:
///   1. Registers the connection with `WsManager`.
///   2. Spawns a sender task that forwards messages from the manager channel.
///   3. Processes inbound messages on the current task.
///   4. Cleans up on disconnect.
async fn handle_socket(socket: WebSocket, ws_manager: Arc<WsManager>) {
    let conn_id = uuid::Uuid::new_v4().to_string();
    tracing::info!(conn_id = %conn_id, "WebSocket connected");

    // Register and get the receiver for outbound messages.
    let mut rx = ws_manager.add(conn_id.clone(), None).await;

    let (mut sink, mut stream) = socket.split();

    // Sender task: forward channel messages to the WebSocket sink.
    let sender_conn_id = conn_id.clone();
    let send_task = tokio::spawn(async move {
        while let Some(msg) = rx.recv().await {
            if sink.send(msg).await.is_err() {
                tracing::debug!(conn_id = %sender_conn_id, "WebSocket sink closed");
                break;
            }
        }
    });

    // Receiver loop: process inbound messages.
    while let Some(result) = stream.next().await {
        match result {
            Ok(Message::Close(_)) => break,
            Ok(Message::Pong(_)) => {
                tracing::trace!(conn_id = %conn_id, "Pong received");
            }
            Ok(_msg) => {
                // Future PRDs will add message dispatching here.
            }
            Err(e) => {
                tracing::debug!(conn_id = %conn_id, error = %e, "WebSocket receive error");
                break;
            }
        }
    }

    // Clean up: remove connection and abort sender task.
    ws_manager.remove(&conn_id).await;
    send_task.abort();
    tracing::info!(conn_id = %conn_id, "WebSocket disconnected");
}
