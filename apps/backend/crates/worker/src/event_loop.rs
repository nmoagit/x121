//! ComfyUI event processing loop.
//!
//! Listens to the broadcast channel from the ComfyUI manager and
//! dispatches completion/error events to the pipeline handlers.

use std::sync::Arc;

use tokio::sync::broadcast;
use x121_comfyui::api::ComfyUIApi;
use x121_comfyui::events::ComfyUIEvent;
use x121_comfyui::manager::ComfyUIManager;
use x121_core::storage::StorageProvider;
use x121_core::types::DbId;
use x121_db::repositories::{ComfyUIInstanceRepo, RetryAttemptRepo, SegmentRepo};

use x121_core::generation::SYSTEM_USER_ID;
use x121_pipeline::{completion_handler, loop_driver};

/// Run the event processing loop until the broadcast channel closes.
pub async fn run(
    pool: sqlx::PgPool,
    comfyui: Arc<ComfyUIManager>,
    storage: Arc<dyn StorageProvider>,
    mut event_rx: broadcast::Receiver<ComfyUIEvent>,
) {
    tracing::info!("Event loop started — listening for ComfyUI events");

    // Also check for scenes that are marked as generating but have no active segment.
    // This handles the case where the worker restarts while generation was in progress.
    if let Err(e) = resume_stalled_scenes(&pool, &comfyui, &storage).await {
        tracing::error!(error = %e, "Failed to resume stalled scenes");
    }

    loop {
        match event_rx.recv().await {
            Ok(event) => {
                handle_event(&pool, &comfyui, &storage, event).await;
            }
            Err(broadcast::error::RecvError::Lagged(count)) => {
                tracing::warn!(count, "Dropped {count} events due to lag");
            }
            Err(broadcast::error::RecvError::Closed) => {
                tracing::info!("Event channel closed — exiting event loop");
                break;
            }
        }
    }
}

/// Dispatch a single ComfyUI event.
async fn handle_event(
    pool: &sqlx::PgPool,
    comfyui: &Arc<ComfyUIManager>,
    storage: &Arc<dyn StorageProvider>,
    event: ComfyUIEvent,
) {
    match event {
        ComfyUIEvent::GenerationCompleted {
            instance_id,
            platform_job_id,
            prompt_id,
            ..
        } => {
            handle_generation_completed(pool, comfyui, storage, instance_id, platform_job_id, &prompt_id)
                .await;
        }
        ComfyUIEvent::GenerationError {
            platform_job_id,
            prompt_id,
            error,
            ..
        } => {
            tracing::error!(
                platform_job_id,
                %prompt_id,
                %error,
                "Generation failed — checking auto-retry",
            );
            handle_generation_error(pool, comfyui, storage, platform_job_id, &error).await;
        }
        ComfyUIEvent::GenerationProgress {
            platform_job_id,
            percent,
            current_node,
            ..
        } => {
            tracing::debug!(
                platform_job_id,
                percent,
                node = ?current_node,
                "Generation progress",
            );
        }
        ComfyUIEvent::InstanceConnected { instance_id } => {
            tracing::info!(instance_id, "ComfyUI instance connected");
        }
        ComfyUIEvent::InstanceDisconnected { instance_id } => {
            tracing::warn!(instance_id, "ComfyUI instance disconnected");
        }
        ComfyUIEvent::GenerationCancelled { .. } => {}
    }
}

/// Handle a successfully completed generation.
async fn handle_generation_completed(
    pool: &sqlx::PgPool,
    comfyui: &Arc<ComfyUIManager>,
    storage: &Arc<dyn StorageProvider>,
    instance_id: DbId,
    platform_job_id: DbId,
    prompt_id: &str,
) {
    // Look up the segment from the job's parameters.
    let (segment_id, scene_id) = match lookup_segment_from_job(pool, platform_job_id).await {
        Ok(ids) => ids,
        Err(e) => {
            tracing::error!(
                platform_job_id,
                error = %e,
                "Failed to look up segment for completed job",
            );
            return;
        }
    };

    // Build a ComfyUI API client for this instance to download outputs.
    let api = match build_api_for_instance(pool, instance_id).await {
        Ok(api) => api,
        Err(e) => {
            tracing::error!(instance_id, error = %e, "Failed to build API client");
            return;
        }
    };

    // Process completion: download output, store, update DB.
    let completion = match completion_handler::handle_completion(
        pool, &api, storage, segment_id, scene_id, prompt_id,
    )
    .await
    {
        Ok(result) => result,
        Err(e) => {
            tracing::error!(
                segment_id,
                scene_id,
                error = %e,
                "Failed to process completion",
            );
            return;
        }
    };

    // Evaluate stop decision and continue or finalize.
    match loop_driver::evaluate_and_continue(pool, comfyui, storage, &completion, SYSTEM_USER_ID)
        .await
    {
        Ok(loop_driver::LoopOutcome::NextSubmitted {
            segment_id,
            job_id,
            prompt_id,
        }) => {
            tracing::info!(segment_id, job_id, %prompt_id, "Next segment submitted");
        }
        Ok(loop_driver::LoopOutcome::SceneComplete {
            scene_id,
            total_duration,
        }) => {
            tracing::info!(scene_id, total_duration, "Scene generation complete");
        }
        Err(e) => {
            tracing::error!(
                scene_id = completion.scene_id,
                error = %e,
                "Failed to evaluate loop continuation",
            );
        }
    }
}

/// Look up the segment_id and scene_id from a platform job's parameters.
async fn lookup_segment_from_job(
    pool: &sqlx::PgPool,
    job_id: DbId,
) -> Result<(DbId, DbId), x121_pipeline::PipelineError> {
    let job = x121_db::repositories::JobRepo::find_by_id(pool, job_id)
        .await
        .map_err(x121_pipeline::PipelineError::Database)?
        .ok_or_else(|| {
            x121_pipeline::PipelineError::MissingConfig(format!("Job {job_id} not found"))
        })?;

    let params: x121_db::models::generation::SegmentJobParams =
        serde_json::from_value(job.parameters).map_err(|e| {
            x121_pipeline::PipelineError::MissingConfig(format!(
                "Failed to parse SegmentJobParams: {e}"
            ))
        })?;

    Ok((params.segment_id, params.scene_id))
}

/// Build a `ComfyUIApi` client for a specific instance.
async fn build_api_for_instance(
    pool: &sqlx::PgPool,
    instance_id: DbId,
) -> Result<ComfyUIApi, x121_pipeline::PipelineError> {
    let instance = ComfyUIInstanceRepo::find_by_id(pool, instance_id)
        .await
        .map_err(x121_pipeline::PipelineError::Database)?
        .ok_or_else(|| {
            x121_pipeline::PipelineError::MissingConfig(format!(
                "ComfyUI instance {instance_id} not found"
            ))
        })?;

    Ok(ComfyUIApi::new(instance.api_url))
}

/// Handle a failed generation: mark as failed, then attempt auto-retry
/// if the scene type's policy allows it.
async fn handle_generation_error(
    pool: &sqlx::PgPool,
    comfyui: &Arc<ComfyUIManager>,
    storage: &Arc<dyn StorageProvider>,
    platform_job_id: DbId,
    error_msg: &str,
) {
    let (segment_id, scene_id) = match lookup_segment_from_job(pool, platform_job_id).await {
        Ok(ids) => ids,
        Err(e) => {
            tracing::error!(error = %e, "Failed to look up segment for failed job");
            return;
        }
    };

    // Mark the segment as failed.
    if let Err(e) = mark_segment_failed(pool, platform_job_id).await {
        tracing::error!(error = %e, "Failed to mark segment as failed");
        return;
    }

    // Check auto-retry policy on the scene type.
    let (_scene, scene_type) = match x121_pipeline::load_scene_and_type(pool, scene_id).await {
        Ok(pair) => pair,
        Err(e) => {
            tracing::error!(error = %e, "Failed to load scene type for retry check");
            return;
        }
    };

    if !scene_type.auto_retry_enabled {
        tracing::info!(scene_id, segment_id, "Auto-retry disabled — not retrying");
        return;
    }

    // Count existing retry attempts for this segment.
    let attempt_count = match RetryAttemptRepo::count_by_segment(pool, segment_id).await {
        Ok(c) => c,
        Err(e) => {
            tracing::error!(error = %e, "Failed to count retry attempts");
            return;
        }
    };

    if attempt_count >= scene_type.auto_retry_max_attempts as i64 {
        tracing::warn!(
            scene_id,
            segment_id,
            attempt_count,
            max = scene_type.auto_retry_max_attempts,
            "Max retry attempts reached — not retrying",
        );
        return;
    }

    // Record the retry attempt.
    let _ = RetryAttemptRepo::create(
        pool,
        &x121_db::models::retry_attempt::CreateRetryAttempt {
            segment_id,
            attempt_number: (attempt_count + 1) as i32,
            seed: chrono::Utc::now().timestamp_millis(),
            parameters: serde_json::json!({}),
            original_parameters: serde_json::json!({ "error": error_msg }),
        },
    )
    .await;

    // Determine the segment index from the segment record.
    let segment = match x121_db::repositories::SegmentRepo::find_by_id(pool, segment_id).await {
        Ok(Some(s)) => s,
        _ => return,
    };

    tracing::info!(
        scene_id,
        segment_id,
        attempt = attempt_count + 1,
        "Auto-retrying failed segment",
    );

    // Re-submit the same segment index.
    match x121_pipeline::submitter::submit_segment(
        pool,
        comfyui,
        storage,
        scene_id,
        segment.sequence_index as u32,
        SYSTEM_USER_ID,
    )
    .await
    {
        Ok(result) => {
            tracing::info!(
                scene_id,
                new_segment_id = result.segment_id,
                "Retry segment submitted",
            );
        }
        Err(e) => {
            tracing::error!(
                scene_id,
                error = %e,
                "Failed to submit retry segment",
            );
        }
    }
}

/// Mark a segment as failed when generation errors occur.
async fn mark_segment_failed(
    pool: &sqlx::PgPool,
    job_id: DbId,
) -> Result<(), x121_pipeline::PipelineError> {
    let (segment_id, _scene_id) = lookup_segment_from_job(pool, job_id).await?;

    let update = x121_db::models::generation::UpdateSegmentGeneration {
        generation_completed_at: Some(chrono::Utc::now()),
        ..Default::default()
    };
    SegmentRepo::update_generation_state(pool, segment_id, &update)
        .await
        .map_err(x121_pipeline::PipelineError::Database)?;

    Ok(())
}

/// Check for scenes that were generating before a worker restart and
/// submit their next segment if needed.
async fn resume_stalled_scenes(
    pool: &sqlx::PgPool,
    comfyui: &Arc<ComfyUIManager>,
    storage: &Arc<dyn StorageProvider>,
) -> Result<(), x121_pipeline::PipelineError> {
    use x121_db::repositories::SceneRepo;

    let generating_scenes = SceneRepo::list_generating(pool)
        .await
        .map_err(x121_pipeline::PipelineError::Database)?;

    if generating_scenes.is_empty() {
        tracing::info!("No stalled scenes to resume");
        return Ok(());
    }

    tracing::info!(
        count = generating_scenes.len(),
        "Found scenes in generating state — checking for stalled segments",
    );

    for scene in generating_scenes {
        // Check if there's an active (in-progress) segment.
        let active = SegmentRepo::find_active_for_scene(pool, scene.id)
            .await
            .map_err(x121_pipeline::PipelineError::Database)?;

        if active.is_some() {
            // There's already an active segment — ComfyUI may still be processing it.
            // Don't submit a duplicate.
            tracing::debug!(scene_id = scene.id, "Scene has active segment — skipping");
            continue;
        }

        // No active segment — submit the next one.
        let next_index = SegmentRepo::next_sequence_index(pool, scene.id)
            .await
            .map_err(x121_pipeline::PipelineError::Database)?;

        tracing::info!(
            scene_id = scene.id,
            next_index,
            "Resuming generation — submitting next segment",
        );

        match x121_pipeline::submitter::submit_segment(
            pool,
            comfyui,
            storage,
            scene.id,
            next_index as u32,
            SYSTEM_USER_ID,
        )
        .await
        {
            Ok(result) => {
                tracing::info!(
                    scene_id = scene.id,
                    segment_id = result.segment_id,
                    "Resumed segment submitted",
                );
            }
            Err(e) => {
                tracing::error!(
                    scene_id = scene.id,
                    error = %e,
                    "Failed to resume generation for scene",
                );
            }
        }
    }

    Ok(())
}
