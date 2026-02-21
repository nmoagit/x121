//! WebSocket connection and metrics push loop.
//!
//! Connects to the backend WebSocket endpoint, periodically collects
//! GPU metrics via [`MetricsCollector`](crate::collector::MetricsCollector),
//! and pushes them as JSON.  Also listens for incoming commands
//! (e.g. service restarts) from the backend.

use std::time::Duration;

use chrono::Utc;
use futures::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use tokio_tungstenite::connect_async;
use tokio_tungstenite::tungstenite::Message;

use trulience_core::metric_names::{MSG_TYPE_GPU_METRICS, MSG_TYPE_RESTART_RESULT};

use crate::collector::{GpuMetrics, MetricsCollector};
use crate::restart::{self, RestartCommand, RestartResult};

/// Reconnection delay after a WebSocket failure.
const RECONNECT_DELAY: Duration = Duration::from_secs(5);

/// Outgoing metrics payload sent to the backend.
#[derive(Debug, Serialize)]
struct MetricsPayload {
    r#type: &'static str,
    worker_id: i64,
    metrics: Vec<GpuMetrics>,
    timestamp: String,
}

/// Outgoing restart result payload sent to the backend.
#[derive(Debug, Serialize)]
struct RestartResultPayload {
    r#type: &'static str,
    worker_id: i64,
    result: RestartResult,
    timestamp: String,
}

/// Envelope for incoming messages from the backend.
#[derive(Debug, Deserialize)]
#[serde(tag = "type")]
enum IncomingMessage {
    #[serde(rename = "restart")]
    Restart(RestartCommand),
}

/// Run the metrics push loop indefinitely.
///
/// This function never returns under normal operation.  It reconnects
/// with a fixed delay if the WebSocket connection drops.
pub async fn run(ws_url: &str, worker_id: i64, interval: Duration, collector: &MetricsCollector) {
    loop {
        tracing::info!(url = %ws_url, "Connecting to backend WebSocket");

        match connect_async(ws_url).await {
            Ok((ws_stream, _response)) => {
                tracing::info!("WebSocket connected");
                run_session(ws_stream, worker_id, interval, collector).await;
                tracing::warn!("WebSocket session ended, reconnecting");
            }
            Err(e) => {
                tracing::error!(error = %e, "WebSocket connection failed");
            }
        }

        tokio::time::sleep(RECONNECT_DELAY).await;
    }
}

/// Drive a single WebSocket session: push metrics on a timer and
/// handle incoming commands via `tokio::select!`.
async fn run_session(
    ws_stream: tokio_tungstenite::WebSocketStream<
        tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>,
    >,
    worker_id: i64,
    interval: Duration,
    collector: &MetricsCollector,
) {
    let (mut sink, mut stream) = ws_stream.split();
    let mut ticker = tokio::time::interval(interval);

    loop {
        tokio::select! {
            _ = ticker.tick() => {
                if let Err(e) = send_metrics(&mut sink, worker_id, collector).await {
                    tracing::error!(error = %e, "Failed to send metrics");
                    break;
                }
            }
            msg = stream.next() => {
                match msg {
                    Some(Ok(Message::Text(text))) => {
                        handle_incoming(&mut sink, worker_id, &text).await;
                    }
                    Some(Ok(Message::Ping(_) | Message::Pong(_))) => {
                        // Handled automatically by tungstenite.
                    }
                    Some(Ok(Message::Close(frame))) => {
                        tracing::info!(?frame, "Backend closed WebSocket");
                        break;
                    }
                    Some(Ok(_)) => {
                        // Binary / Frame — ignore.
                    }
                    Some(Err(e)) => {
                        tracing::error!(error = %e, "WebSocket receive error");
                        break;
                    }
                    None => {
                        tracing::info!("WebSocket stream exhausted");
                        break;
                    }
                }
            }
        }
    }
}

/// Collect metrics and send them as a JSON text frame.
async fn send_metrics<S>(
    sink: &mut S,
    worker_id: i64,
    collector: &MetricsCollector,
) -> Result<(), tokio_tungstenite::tungstenite::Error>
where
    S: SinkExt<Message, Error = tokio_tungstenite::tungstenite::Error> + Unpin,
{
    let metrics = collector.collect();

    let payload = MetricsPayload {
        r#type: MSG_TYPE_GPU_METRICS,
        worker_id,
        metrics,
        timestamp: Utc::now().to_rfc3339(),
    };

    let json = serde_json::to_string(&payload).expect("MetricsPayload is always serialisable");
    tracing::debug!(worker_id, "Sending GPU metrics");
    sink.send(Message::Text(json)).await
}

/// Parse and dispatch an incoming text message from the backend.
async fn handle_incoming<S>(sink: &mut S, worker_id: i64, text: &str)
where
    S: SinkExt<Message, Error = tokio_tungstenite::tungstenite::Error> + Unpin,
{
    match serde_json::from_str::<IncomingMessage>(text) {
        Ok(IncomingMessage::Restart(cmd)) => {
            tracing::info!(service = %cmd.service_name, force = cmd.force, "Received restart command");
            let result = restart::execute_restart(&cmd).await;
            send_restart_result(sink, worker_id, result).await;
        }
        Err(e) => {
            tracing::warn!(error = %e, raw = %text, "Unknown or malformed incoming message");
        }
    }
}

/// Send a restart result back to the backend.
async fn send_restart_result<S>(sink: &mut S, worker_id: i64, result: RestartResult)
where
    S: SinkExt<Message, Error = tokio_tungstenite::tungstenite::Error> + Unpin,
{
    let payload = RestartResultPayload {
        r#type: MSG_TYPE_RESTART_RESULT,
        worker_id,
        result,
        timestamp: Utc::now().to_rfc3339(),
    };

    let json =
        serde_json::to_string(&payload).expect("RestartResultPayload is always serialisable");

    if let Err(e) = sink.send(Message::Text(json)).await {
        tracing::error!(error = %e, "Failed to send restart result");
    }
}
