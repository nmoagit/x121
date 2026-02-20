//! WebSocket client for connecting to a ComfyUI instance.
//!
//! [`ComfyUIClient`] holds the connection configuration for a single
//! ComfyUI instance.  Call [`ComfyUIClient::connect`] to establish a
//! live [`ComfyUIConnection`] over WebSocket.

use tokio_tungstenite::{connect_async, MaybeTlsStream};
use trulience_core::types::DbId;

/// Configuration handle for a ComfyUI instance.
///
/// Stores the WebSocket and HTTP API URLs needed to communicate with
/// one ComfyUI server. Create a [`ComfyUIConnection`] by calling
/// [`connect`](Self::connect).
pub struct ComfyUIClient {
    instance_id: DbId,
    ws_url: String,
    api_url: String,
}

/// A live WebSocket connection to a ComfyUI instance.
///
/// Holds the underlying `WebSocketStream` plus the identifiers needed
/// to correlate messages back to the platform.
pub struct ComfyUIConnection {
    /// Internal database ID of the ComfyUI instance row.
    pub instance_id: DbId,
    /// Unique client ID sent during the WebSocket handshake.
    pub client_id: String,
    /// Base HTTP API URL (e.g. `http://host:8188`).
    pub api_url: String,
    /// The raw WebSocket stream for reading/writing frames.
    pub ws_stream: tokio_tungstenite::WebSocketStream<MaybeTlsStream<tokio::net::TcpStream>>,
}

impl ComfyUIClient {
    /// Create a new client targeting a specific ComfyUI instance.
    ///
    /// * `instance_id` - database row ID for this instance.
    /// * `ws_url`      - WebSocket base URL, e.g. `ws://host:8188`.
    /// * `api_url`     - HTTP base URL, e.g. `http://host:8188`.
    pub fn new(instance_id: DbId, ws_url: String, api_url: String) -> Self {
        Self {
            instance_id,
            ws_url,
            api_url,
        }
    }

    /// Database row ID of this ComfyUI instance.
    pub fn instance_id(&self) -> DbId {
        self.instance_id
    }

    /// WebSocket base URL (e.g. `ws://host:8188`).
    pub fn ws_url(&self) -> &str {
        &self.ws_url
    }

    /// HTTP API base URL (e.g. `http://host:8188`).
    pub fn api_url(&self) -> &str {
        &self.api_url
    }

    /// Connect to the ComfyUI WebSocket endpoint.
    ///
    /// Generates a unique `client_id` (UUID v4) and appends it as a
    /// query parameter so that ComfyUI can address messages back to
    /// this specific client.
    pub async fn connect(&self) -> Result<ComfyUIConnection, ComfyUIClientError> {
        let client_id = uuid::Uuid::new_v4().to_string();
        let url = format!("{}/ws?clientId={}", self.ws_url, client_id);

        let (ws_stream, _response) = connect_async(&url).await.map_err(|e| {
            ComfyUIClientError::Connection(format!(
                "Failed to connect to ComfyUI at {}: {e}",
                self.ws_url
            ))
        })?;

        tracing::info!(
            instance_id = self.instance_id,
            client_id = %client_id,
            "Connected to ComfyUI at {}",
            self.ws_url,
        );

        Ok(ComfyUIConnection {
            instance_id: self.instance_id,
            client_id,
            api_url: self.api_url.clone(),
            ws_stream,
        })
    }
}

/// Errors that can occur when working with the WebSocket client.
#[derive(Debug, thiserror::Error)]
pub enum ComfyUIClientError {
    /// Failed to establish the initial WebSocket connection.
    #[error("Connection error: {0}")]
    Connection(String),

    /// A protocol-level error on an already-established connection.
    #[error("Protocol error: {0}")]
    Protocol(String),
}
