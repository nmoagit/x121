//! WebSocket message processing loop.
//!
//! Reads raw frames from a ComfyUI WebSocket connection, parses them
//! into typed [`ComfyUIMessage`] variants, updates execution status in
//! the database, and emits [`ComfyUIEvent`]s to the broadcast channel.

use futures::{SinkExt, StreamExt};
use tokio::sync::broadcast;
use tokio_tungstenite::tungstenite::Message;
use x121_core::types::DbId;
use x121_db::models::scene_generation_log::CreateGenerationLog;
use x121_db::repositories::{ComfyUIExecutionRepo, SceneGenerationLogRepo};

use crate::events::ComfyUIEvent;
use crate::messages::{parse_message, ComfyUIMessage};

/// Interval between WebSocket ping frames.
///
/// RunPod's proxy closes idle connections after ~60 seconds.
/// Sending a ping every 30 seconds keeps the connection alive.
const PING_INTERVAL: std::time::Duration = std::time::Duration::from_secs(30);

/// Look up the scene_id for a ComfyUI prompt by joining through jobs.
///
/// Path: comfyui_executions.platform_job_id → jobs.parameters->>'scene_id'.
async fn resolve_scene_id(pool: &sqlx::PgPool, prompt_id: &str) -> Option<DbId> {
    let row: Option<(Option<i64>,)> = sqlx::query_as(
        "SELECT (j.parameters->>'scene_id')::bigint \
         FROM comfyui_executions e \
         JOIN jobs j ON j.id = e.platform_job_id \
         WHERE e.comfyui_prompt_id = $1",
    )
    .bind(prompt_id)
    .fetch_optional(pool)
    .await
    .ok()?;
    row.and_then(|r| r.0)
}

/// Write a generation log entry for the scene associated with a prompt.
/// Fire-and-forget — errors are traced but never propagated.
async fn write_gen_log(pool: &sqlx::PgPool, scene_id: DbId, level: &str, message: String) {
    let input = CreateGenerationLog {
        scene_id,
        level: level.to_string(),
        message,
        metadata: None,
    };
    if let Err(e) = SceneGenerationLogRepo::insert(pool, &input).await {
        tracing::warn!(scene_id, error = %e, "Failed to write generation log entry");
    }
}

/// Process WebSocket messages from a ComfyUI connection.
///
/// Loops until the WebSocket closes, encounters a fatal receive error,
/// or the stream is exhausted. Each text frame is parsed via
/// [`parse_message`] and the resulting variant drives a database update
/// and/or a broadcast event.
///
/// Sends periodic WebSocket ping frames to prevent proxy idle timeouts.
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
    let mut ping_interval = tokio::time::interval(PING_INTERVAL);
    // Skip the first immediate tick — the connection is already fresh.
    ping_interval.tick().await;

    loop {
        tokio::select! {
            msg_opt = ws_stream.next() => {
                match msg_opt {
                    Some(Ok(Message::Text(text))) => {
                        handle_text_message(&text, instance_id, pool, event_tx).await;
                    }
                    Some(Ok(Message::Binary(_))) => {
                        tracing::trace!(instance_id, "Ignoring binary message (preview image)");
                    }
                    Some(Ok(Message::Ping(_) | Message::Pong(_))) => {}
                    Some(Ok(Message::Close(frame))) => {
                        tracing::info!(instance_id, ?frame, "ComfyUI WebSocket closed");
                        break;
                    }
                    Some(Ok(Message::Frame(_))) => {}
                    Some(Err(e)) => {
                        tracing::error!(instance_id, error = %e, "WebSocket receive error");
                        break;
                    }
                    None => {
                        tracing::info!(instance_id, "WebSocket stream ended");
                        break;
                    }
                }
            }
            _ = ping_interval.tick() => {
                if let Err(e) = ws_stream.send(Message::Ping(vec![])).await {
                    tracing::warn!(instance_id, error = %e, "Failed to send WebSocket ping");
                    break;
                }
                tracing::trace!(instance_id, "Sent WebSocket keepalive ping");
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
            ComfyUIMessage::ProgressState(data) => {
                handle_progress_state(instance_id, pool, event_tx, &data).await;
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
    tracing::info!(
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
    if let Some(scene_id) = resolve_scene_id(pool, &data.prompt_id).await {
        write_gen_log(pool, scene_id, "info", "ComfyUI execution started".to_string()).await;
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
        // Check if the execution was already marked as failed (e.g. by an
        // execution_error message that arrived before this final executing
        // message). ComfyUI sends `executing { node: None }` even after
        // errors, so we must not overwrite a failed status with completed.
        let already_failed = matches!(
            ComfyUIExecutionRepo::find_by_prompt_id(pool, &data.prompt_id).await,
            Ok(Some(exec)) if exec.status == "failed"
        );

        if already_failed {
            tracing::info!(
                instance_id,
                prompt_id = %data.prompt_id,
                "Execution finished but already marked as failed — skipping completion",
            );
            return;
        }

        tracing::info!(
            instance_id,
            prompt_id = %data.prompt_id,
            "Execution completed (all nodes done)",
        );
        if let Err(e) = ComfyUIExecutionRepo::mark_completed(pool, &data.prompt_id).await {
            tracing::error!(error = %e, "Failed to mark execution completed");
        }
        if let Some(scene_id) = resolve_scene_id(pool, &data.prompt_id).await {
            write_gen_log(pool, scene_id, "success", "ComfyUI execution completed — all nodes done".to_string()).await;
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

/// Handle per-node progress state messages from newer ComfyUI versions.
///
/// Computes overall progress as the ratio of finished nodes to total nodes
/// and emits a `GenerationProgress` event so the UI can display it.
async fn handle_progress_state(
    instance_id: DbId,
    pool: &sqlx::PgPool,
    event_tx: &broadcast::Sender<ComfyUIEvent>,
    data: &crate::messages::ProgressStateData,
) {
    let total = data.nodes.len();
    let finished = data.nodes.values().filter(|n| n.state == "finished").count();
    let running_node = data
        .nodes
        .values()
        .find(|n| n.state == "running")
        .map(|n| n.node_id.clone());

    // Look up the platform job ID for this prompt.
    if let Ok(Some(exec)) = ComfyUIExecutionRepo::find_by_prompt_id(pool, &data.prompt_id).await {
        let percent = if total > 0 {
            ((finished as f64 / total as f64) * 100.0) as i16
        } else {
            0
        };

        let node_label = running_node.as_deref().unwrap_or("-");

        tracing::info!(
            instance_id,
            job_id = exec.platform_job_id,
            prompt_id = %data.prompt_id,
            finished,
            total,
            percent,
            running_node = node_label,
            "Generation progress",
        );

        // Write to scene generation log so the frontend terminal can display it.
        // Only write when progress actually changed (compare with stored progress).
        if exec.progress_percent != percent {
            if let Err(e) = ComfyUIExecutionRepo::update_progress(
                pool,
                &data.prompt_id,
                percent,
                running_node.as_deref(),
            )
            .await
            {
                tracing::warn!(error = %e, "Failed to update execution progress");
            }

            if let Some(scene_id) = resolve_scene_id(pool, &data.prompt_id).await {
                write_gen_log(
                    pool,
                    scene_id,
                    "info",
                    format!(
                        "Job {} — {finished}/{total} nodes ({percent}%) | node: {node_label}",
                        exec.platform_job_id,
                    ),
                )
                .await;
            }
        }

        let _ = event_tx.send(ComfyUIEvent::GenerationProgress {
            instance_id,
            platform_job_id: exec.platform_job_id,
            prompt_id: data.prompt_id.clone(),
            percent,
            current_node: running_node,
        });
    }
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
    if let Some(scene_id) = resolve_scene_id(pool, &data.prompt_id).await {
        write_gen_log(
            pool,
            scene_id,
            "error",
            format!(
                "ComfyUI error on node {}: {} ({})",
                data.node_id, data.exception_message, data.exception_type,
            ),
        )
        .await;
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
