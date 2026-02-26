//! ComfyUI event handler for job progress tracking (PRD-07).
//!
//! Translates [`ComfyUIEvent`] variants into job database updates and
//! WebSocket notifications.  No automatic retry is performed on failure.

use axum::extract::ws::Message;
use sqlx::PgPool;
use x121_comfyui::events::ComfyUIEvent;
use x121_core::job_events::{
    MSG_TYPE_JOB_CANCELLED, MSG_TYPE_JOB_COMPLETED, MSG_TYPE_JOB_FAILED, MSG_TYPE_JOB_PROGRESS,
};
use x121_db::repositories::JobRepo;

use crate::ws::WsManager;

/// Handle a ComfyUI event by updating the job record and notifying
/// connected WebSocket clients.
pub async fn handle_comfyui_event(pool: &PgPool, ws_manager: &WsManager, event: &ComfyUIEvent) {
    match event {
        ComfyUIEvent::GenerationProgress {
            platform_job_id,
            percent,
            current_node,
            ..
        } => {
            if let Err(e) =
                JobRepo::update_progress(pool, *platform_job_id, *percent, current_node.as_deref())
                    .await
            {
                tracing::error!(
                    job_id = platform_job_id,
                    error = %e,
                    "Failed to update job progress",
                );
            }

            broadcast_json(
                ws_manager,
                serde_json::json!({
                    "type": MSG_TYPE_JOB_PROGRESS,
                    "job_id": platform_job_id,
                    "percent": percent,
                    "current_node": current_node,
                }),
            )
            .await;
        }

        ComfyUIEvent::GenerationCompleted {
            platform_job_id,
            outputs,
            ..
        } => {
            if let Err(e) = JobRepo::complete(pool, *platform_job_id, outputs).await {
                tracing::error!(
                    job_id = platform_job_id,
                    error = %e,
                    "Failed to mark job completed",
                );
            }

            broadcast_json(
                ws_manager,
                serde_json::json!({
                    "type": MSG_TYPE_JOB_COMPLETED,
                    "job_id": platform_job_id,
                }),
            )
            .await;
        }

        ComfyUIEvent::GenerationError {
            platform_job_id,
            error,
            ..
        } => {
            // Mark job as failed. No automatic retry.
            if let Err(e) = JobRepo::fail(pool, *platform_job_id, error, None).await {
                tracing::error!(
                    job_id = platform_job_id,
                    error = %e,
                    "Failed to mark job as failed",
                );
            }

            broadcast_json(
                ws_manager,
                serde_json::json!({
                    "type": MSG_TYPE_JOB_FAILED,
                    "job_id": platform_job_id,
                    "error": error,
                }),
            )
            .await;
        }

        ComfyUIEvent::GenerationCancelled {
            platform_job_id, ..
        } => {
            // The cancel was already recorded by the manager, but
            // update the job record to be safe.
            if let Err(e) = JobRepo::cancel(pool, *platform_job_id).await {
                tracing::error!(
                    job_id = platform_job_id,
                    error = %e,
                    "Failed to mark job as cancelled",
                );
            }

            broadcast_json(
                ws_manager,
                serde_json::json!({
                    "type": MSG_TYPE_JOB_CANCELLED,
                    "job_id": platform_job_id,
                }),
            )
            .await;
        }

        // Instance connect/disconnect events are not job-specific.
        _ => {}
    }
}

/// Serialize a JSON value and broadcast it to all connected WebSocket clients.
async fn broadcast_json(ws_manager: &WsManager, payload: serde_json::Value) {
    ws_manager
        .broadcast(Message::Text(payload.to_string().into()))
        .await;
}
