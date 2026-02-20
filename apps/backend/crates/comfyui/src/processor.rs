//! WebSocket message processing loop.
//!
//! Reads raw frames from a ComfyUI WebSocket connection, parses them
//! into typed [`ComfyUIMessage`] variants, updates execution status in
//! the database, and emits [`ComfyUIEvent`]s to the broadcast channel.

use futures::StreamExt;
use tokio::sync::broadcast;
use tokio_tungstenite::tungstenite::Message;
use trulience_core::types::DbId;
use trulience_db::repositories::ComfyUIExecutionRepo;

use crate::events::ComfyUIEvent;
use crate::messages::{parse_message, ComfyUIMessage};

/// Process WebSocket messages from a ComfyUI connection.
///
/// Loops until the WebSocket closes, encounters a fatal receive error,
/// or the stream is exhausted. Each text frame is parsed via
/// [`parse_message`] and the resulting variant drives a database update
/// and/or a broadcast event.
///
/// Binary frames (preview images) are intentionally ignored for now.
pub async fn process_messages(
    ws_stream: &mut tokio_tungstenite::WebSocketStream<
        tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>,
    >,
    instance_id: DbId,
    pool: &sqlx::PgPool,
    event_tx: &broadcast::Sender<ComfyUIEvent>,
) {
    while let Some(msg_result) = ws_stream.next().await {
        match msg_result {
            Ok(Message::Text(text)) => {
                handle_text_message(&text, instance_id, pool, event_tx).await;
            }
            Ok(Message::Binary(_)) => {
                // ComfyUI sends binary messages for preview images.
                // Ignored for MVP (PRD-34 will handle these).
                tracing::trace!(instance_id, "Ignoring binary message (preview image)");
            }
            Ok(Message::Ping(_) | Message::Pong(_)) => {
                // Handled automatically by tungstenite.
            }
            Ok(Message::Close(frame)) => {
                tracing::info!(instance_id, ?frame, "ComfyUI WebSocket closed");
                break;
            }
            Ok(Message::Frame(_)) => {}
            Err(e) => {
                tracing::error!(instance_id, error = %e, "WebSocket receive error");
                break;
            }
        }
    }
}

/// Dispatch a single parsed text frame to the appropriate handler.
async fn handle_text_message(
    text: &str,
    instance_id: DbId,
    pool: &sqlx::PgPool,
    event_tx: &broadcast::Sender<ComfyUIEvent>,
) {
    match parse_message(text) {
        Ok(msg) => match msg {
            ComfyUIMessage::Progress(data) => {
                handle_progress(instance_id, &data);
            }
            ComfyUIMessage::ExecutionStart(data) => {
                handle_execution_start(instance_id, pool, &data).await;
            }
            ComfyUIMessage::Executing(data) => {
                handle_executing(instance_id, pool, event_tx, &data).await;
            }
            ComfyUIMessage::Executed(data) => {
                handle_executed(instance_id, &data);
            }
            ComfyUIMessage::ExecutionError(data) => {
                handle_execution_error(instance_id, pool, event_tx, &data).await;
            }
            ComfyUIMessage::ExecutionCached(_) => {
                tracing::debug!(instance_id, "Execution used cache");
            }
            ComfyUIMessage::Status(data) => {
                tracing::debug!(
                    instance_id,
                    queue_remaining = data.status.exec_info.queue_remaining,
                    "ComfyUI queue status",
                );
            }
        },
        Err(e) => {
            tracing::warn!(
                instance_id,
                error = %e,
                raw_message = %text,
                "Failed to parse ComfyUI message",
            );
        }
    }
}

// ---- individual message handlers ----

fn handle_progress(instance_id: DbId, data: &crate::messages::ProgressData) {
    let percent = if data.max > 0 {
        ((data.value as f64 / data.max as f64) * 100.0) as i16
    } else {
        0
    };
    tracing::debug!(
        instance_id,
        value = data.value,
        max = data.max,
        percent,
        "Generation progress",
    );
}

async fn handle_execution_start(
    instance_id: DbId,
    pool: &sqlx::PgPool,
    data: &crate::messages::ExecutionStartData,
) {
    tracing::info!(
        instance_id,
        prompt_id = %data.prompt_id,
        "Execution started",
    );
    if let Err(e) = ComfyUIExecutionRepo::mark_started(pool, &data.prompt_id).await {
        tracing::error!(error = %e, "Failed to mark execution started");
    }
}

async fn handle_executing(
    instance_id: DbId,
    pool: &sqlx::PgPool,
    event_tx: &broadcast::Sender<ComfyUIEvent>,
    data: &crate::messages::ExecutingData,
) {
    if let Some(ref node) = data.node {
        tracing::debug!(
            instance_id,
            prompt_id = %data.prompt_id,
            node = %node,
            "Executing node",
        );
        if let Err(e) = ComfyUIExecutionRepo::update_current_node(pool, &data.prompt_id, node).await
        {
            tracing::error!(error = %e, "Failed to update current node");
        }
    } else {
        // node == None means execution is complete for this prompt.
        tracing::info!(
            instance_id,
            prompt_id = %data.prompt_id,
            "Execution completed (all nodes done)",
        );
        if let Err(e) = ComfyUIExecutionRepo::mark_completed(pool, &data.prompt_id).await {
            tracing::error!(error = %e, "Failed to mark execution completed");
        }
        // Emit a platform event with the mapped platform_job_id.
        if let Ok(Some(exec)) = ComfyUIExecutionRepo::find_by_prompt_id(pool, &data.prompt_id).await
        {
            let _ = event_tx.send(ComfyUIEvent::GenerationCompleted {
                instance_id,
                platform_job_id: exec.platform_job_id,
                prompt_id: data.prompt_id.clone(),
                outputs: serde_json::Value::Null, // outputs come via Executed messages
            });
        }
    }
}

fn handle_executed(instance_id: DbId, data: &crate::messages::ExecutedData) {
    tracing::debug!(
        instance_id,
        prompt_id = %data.prompt_id,
        node = %data.node,
        "Node executed with output",
    );
    // Outputs are per-node. The final completion is signaled by
    // Executing { node: None }. We just log executed nodes here.
}

async fn handle_execution_error(
    instance_id: DbId,
    pool: &sqlx::PgPool,
    event_tx: &broadcast::Sender<ComfyUIEvent>,
    data: &crate::messages::ErrorData,
) {
    tracing::error!(
        instance_id,
        prompt_id = %data.prompt_id,
        node_id = %data.node_id,
        error_type = %data.exception_type,
        error_message = %data.exception_message,
        "Execution error",
    );
    if let Err(e) =
        ComfyUIExecutionRepo::mark_failed(pool, &data.prompt_id, &data.exception_message).await
    {
        tracing::error!(error = %e, "Failed to mark execution as failed");
    }
    if let Ok(Some(exec)) = ComfyUIExecutionRepo::find_by_prompt_id(pool, &data.prompt_id).await {
        let _ = event_tx.send(ComfyUIEvent::GenerationError {
            instance_id,
            platform_job_id: exec.platform_job_id,
            prompt_id: data.prompt_id.clone(),
            error: data.exception_message.clone(),
        });
    }
}
