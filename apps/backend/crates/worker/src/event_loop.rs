//! ComfyUI event processing loop.
//!
//! Listens to the broadcast channel from the ComfyUI manager and
//! dispatches completion/error events to the pipeline handlers.

use std::sync::Arc;

use tokio::sync::broadcast;
use x121_comfyui::events::ComfyUIEvent;
use x121_comfyui::manager::ComfyUIManager;
use x121_core::activity::{ActivityLogEntry, ActivityLogLevel, ActivityLogSource};
use x121_core::storage::StorageProvider;
use x121_core::types::DbId;
use x121_db::repositories::{RetryAttemptRepo, SegmentRepo, WorkflowRepo};
use x121_events::ActivityLogBroadcaster;

use x121_core::generation::SYSTEM_USER_ID;
use x121_db::repositories::ComfyUIInstanceRepo;
use x121_pipeline::{completion_handler, loop_driver};

/// Run the event processing loop until the broadcast channel closes.
pub async fn run(
    pool: sqlx::PgPool,
    comfyui: Arc<ComfyUIManager>,
    storage: Arc<dyn StorageProvider>,
    mut event_rx: broadcast::Receiver<ComfyUIEvent>,
    broadcaster: Option<Arc<ActivityLogBroadcaster>>,
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
                handle_event(&pool, &comfyui, &storage, event, &broadcaster).await;
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
    broadcaster: &Option<Arc<ActivityLogBroadcaster>>,
) {
    match event {
        ComfyUIEvent::GenerationCompleted {
            instance_id,
            platform_job_id,
            prompt_id,
            ..
        } => {
            if let Some(b) = broadcaster {
                b.publish(
                    ActivityLogEntry::curated(
                        ActivityLogLevel::Info,
                        ActivityLogSource::Worker,
                        format!("Job {platform_job_id} completed"),
                    )
                    .with_job(platform_job_id)
                    .with_entity("comfyui_instance", instance_id),
                );
            }
            handle_generation_completed(
                pool,
                comfyui,
                storage,
                instance_id,
                platform_job_id,
                &prompt_id,
            )
            .await;
            check_drain_completion(pool, instance_id, broadcaster).await;
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
            if let Some(b) = broadcaster {
                b.publish(
                    ActivityLogEntry::curated(
                        ActivityLogLevel::Error,
                        ActivityLogSource::Worker,
                        format!("Job {platform_job_id} failed: {error}"),
                    )
                    .with_job(platform_job_id),
                );
            }
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
            tracing::info!(
                instance_id,
                "ComfyUI instance connected — triggering workflow auto-validation"
            );
            let pool_clone = pool.clone();
            let comfyui_clone = Arc::clone(comfyui);
            tokio::spawn(async move {
                auto_validate_workflows(&pool_clone, &comfyui_clone).await;
            });
        }
        ComfyUIEvent::InstanceDisconnected { instance_id } => {
            tracing::warn!(instance_id, "ComfyUI instance disconnected");
        }
        ComfyUIEvent::GenerationCancelled {
            platform_job_id,
            instance_id,
            ..
        } => {
            if let Some(b) = broadcaster {
                b.publish(
                    ActivityLogEntry::curated(
                        ActivityLogLevel::Info,
                        ActivityLogSource::Worker,
                        format!("Job {platform_job_id} cancelled"),
                    )
                    .with_job(platform_job_id),
                );
            }
            handle_generation_cancelled(pool, platform_job_id).await;
            check_drain_completion(pool, instance_id, broadcaster).await;
        }
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

    // Get the cached ComfyUI API client for this instance from the manager
    // (avoids a redundant DB lookup + new HTTP client allocation).
    let api = match comfyui.api_for_instance(instance_id).await {
        Some(api) => api,
        None => {
            tracing::error!(
                instance_id,
                "ComfyUI instance not connected — cannot download output"
            );
            return;
        }
    };

    // Process completion: download output, store, update DB.
    // Pass Null workflow — the event loop doesn't have the submitted workflow
    // available. classify_outputs handles this gracefully by falling back to
    // single-output extraction.
    let completion = match completion_handler::handle_completion(
        pool,
        &api,
        storage,
        segment_id,
        scene_id,
        prompt_id,
        &serde_json::Value::Null,
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

    x121_pipeline::gen_log::log(
        pool,
        scene_id,
        "error",
        format!("Generation failed: {error_msg}"),
    )
    .await;

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
        x121_pipeline::gen_log::log(
            pool,
            scene_id,
            "error",
            "Max retry attempts reached \u{2014} generation stopped",
        )
        .await;
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

    x121_pipeline::gen_log::log(
        pool,
        scene_id,
        "warn",
        format!(
            "Auto-retrying segment {} (attempt {}/{})",
            segment.sequence_index,
            attempt_count + 1,
            scene_type.auto_retry_max_attempts,
        ),
    )
    .await;

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

/// Handle a cancelled generation: revert scene to Pending, mark segment as cancelled.
async fn handle_generation_cancelled(pool: &sqlx::PgPool, platform_job_id: DbId) {
    let (segment_id, scene_id) = match lookup_segment_from_job(pool, platform_job_id).await {
        Ok(ids) => ids,
        Err(e) => {
            tracing::error!(error = %e, "Failed to look up segment for cancelled job");
            return;
        }
    };

    // Mark the segment as completed (cancelled).
    let update = x121_db::models::generation::UpdateSegmentGeneration {
        generation_completed_at: Some(chrono::Utc::now()),
        ..Default::default()
    };
    if let Err(e) = SegmentRepo::update_generation_state(pool, segment_id, &update).await {
        tracing::error!(segment_id, error = %e, "Failed to update cancelled segment");
    }

    // Determine restore status: Generated if scene has videos, else Pending.
    let restore_status = {
        let has_videos =
            x121_db::repositories::SceneVideoVersionRepo::list_by_scene(pool, scene_id)
                .await
                .map(|v| !v.is_empty())
                .unwrap_or(false);
        if has_videos {
            x121_db::models::status::SceneStatus::Generated.id()
        } else {
            x121_db::models::status::SceneStatus::Pending.id()
        }
    };

    // Revert scene from Generating back to its prior state.
    let scene_update = x121_db::models::generation::UpdateSceneGeneration {
        status_id: Some(restore_status),
        generation_completed_at: None,
        total_segments_estimated: None,
        total_segments_completed: None,
        actual_duration_secs: None,
        transition_segment_index: None,
        generation_started_at: None,
    };
    if let Err(e) =
        x121_db::repositories::SceneRepo::update_generation_state(pool, scene_id, &scene_update)
            .await
    {
        tracing::error!(scene_id, error = %e, "Failed to revert scene to Pending");
    }

    let status_label = if restore_status == x121_db::models::status::SceneStatus::Generated.id() {
        "generated"
    } else {
        "pending"
    };

    x121_pipeline::gen_log::log(
        pool,
        scene_id,
        "warn",
        format!("Generation cancelled by user — scene reverted to {status_label}"),
    )
    .await;

    tracing::info!(scene_id, segment_id, platform_job_id, %status_label, "Generation cancelled — scene reverted");
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

/// Check if an instance is draining and has completed all active jobs (PRD-132).
///
/// Called after job completion or cancellation. If the instance has
/// `drain_mode = true` and zero remaining active jobs, logs that the
/// worker has fully drained.
async fn check_drain_completion(
    pool: &sqlx::PgPool,
    instance_id: DbId,
    broadcaster: &Option<Arc<ActivityLogBroadcaster>>,
) {
    let instance = match ComfyUIInstanceRepo::find_by_id(pool, instance_id).await {
        Ok(Some(inst)) => inst,
        _ => return,
    };

    if !instance.drain_mode {
        return;
    }

    let active_count = match ComfyUIInstanceRepo::count_active_jobs(pool, instance_id).await {
        Ok(count) => count,
        Err(e) => {
            tracing::warn!(
                instance_id,
                error = %e,
                "Failed to count active jobs for drain check",
            );
            return;
        }
    };

    if active_count == 0 {
        tracing::info!(
            instance_id,
            name = %instance.name,
            "Worker drained — instance has no remaining active jobs",
        );
        if let Some(b) = broadcaster {
            b.publish(
                ActivityLogEntry::curated(
                    ActivityLogLevel::Info,
                    ActivityLogSource::Worker,
                    format!(
                        "Worker drain completed (instance {} '{}')",
                        instance_id, instance.name
                    ),
                )
                .with_entity("comfyui_instance", instance_id),
            );
        }
    } else {
        tracing::debug!(
            instance_id,
            active_count,
            "Instance draining — {} jobs remaining",
            active_count,
        );
    }
}

/// Validate all workflows against the live ComfyUI instance.
///
/// Called when a ComfyUI instance connects. Fetches the available node
/// types once, then iterates every workflow, validates its nodes against
/// the live set, and stores the results.
async fn auto_validate_workflows(pool: &sqlx::PgPool, comfyui: &Arc<ComfyUIManager>) {
    use x121_core::workflow_import::{
        self, ModelValidationResult, NodeValidationResult, ValidationResult, ValidationSource,
        WORKFLOW_STATUS_ID_VALIDATED,
    };

    // Get an API client for any connected instance.
    let api = match comfyui.get_any_api().await {
        Some(api) => api,
        None => {
            tracing::warn!("No ComfyUI instance available for auto-validation");
            return;
        }
    };

    // Fetch available node types once (expensive call).
    let available_nodes = match api.get_available_node_types().await {
        Ok(nodes) => nodes,
        Err(e) => {
            tracing::error!(error = %e, "Failed to fetch object_info for auto-validation");
            return;
        }
    };

    tracing::info!(
        node_count = available_nodes.len(),
        "Fetched ComfyUI node types for auto-validation"
    );

    // List all workflow IDs.
    let workflow_ids = match WorkflowRepo::list_all_ids(pool).await {
        Ok(ids) => ids,
        Err(e) => {
            tracing::error!(error = %e, "Failed to list workflow IDs for auto-validation");
            return;
        }
    };

    if workflow_ids.is_empty() {
        tracing::info!("No workflows to auto-validate");
        return;
    }

    tracing::info!(count = workflow_ids.len(), "Auto-validating workflows");

    let mut validated = 0u32;
    let mut failed = 0u32;

    for wf_id in workflow_ids {
        let workflow = match WorkflowRepo::find_by_id(pool, wf_id).await {
            Ok(Some(w)) => w,
            Ok(None) => continue,
            Err(e) => {
                tracing::warn!(workflow_id = wf_id, error = %e, "Failed to load workflow");
                failed += 1;
                continue;
            }
        };

        let parsed = match workflow_import::parse_workflow(&workflow.json_content) {
            Ok(p) => p,
            Err(e) => {
                tracing::warn!(workflow_id = wf_id, error = %e, "Failed to parse workflow JSON");
                failed += 1;
                continue;
            }
        };

        // Validate nodes against the live set.
        let mut seen = Vec::new();
        let mut node_results = Vec::new();
        for node in &parsed.nodes {
            if !seen.contains(&node.class_type) {
                seen.push(node.class_type.clone());
                node_results.push(NodeValidationResult {
                    node_type: node.class_type.clone(),
                    present: available_nodes.contains(&node.class_type),
                });
            }
        }

        let model_results: Vec<ModelValidationResult> = parsed
            .referenced_models
            .iter()
            .chain(parsed.referenced_loras.iter())
            .map(|name| ModelValidationResult {
                model_name: name.clone(),
                found_in_registry: false,
            })
            .collect();

        let overall_valid = node_results.iter().all(|r| r.present);

        let validation = ValidationResult {
            node_results,
            model_results,
            overall_valid,
            validation_source: ValidationSource::Live,
        };

        let validation_json = match serde_json::to_value(&validation) {
            Ok(v) => v,
            Err(_) => continue,
        };

        if let Err(e) = WorkflowRepo::update_validation(pool, wf_id, &validation_json).await {
            tracing::warn!(workflow_id = wf_id, error = %e, "Failed to store validation results");
            failed += 1;
            continue;
        }

        if overall_valid {
            let _ = WorkflowRepo::update_status(pool, wf_id, WORKFLOW_STATUS_ID_VALIDATED).await;
        }

        validated += 1;
    }

    tracing::info!(validated, failed, "Auto-validation complete");
}
