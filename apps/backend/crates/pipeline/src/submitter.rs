//! Submit a segment's workflow to ComfyUI for generation.
//!
//! Orchestrates: load context → upload seed image → build workflow →
//! create DB records → submit to ComfyUI instance via the manager.

use std::sync::Arc;

use x121_comfyui::manager::ComfyUIManager;
use x121_core::activity::{ActivityLogEntry, ActivityLogLevel, ActivityLogSource};
use x121_core::storage::StorageProvider;
use x121_core::types::DbId;
use x121_db::models::generation::SegmentJobParams;
use x121_db::models::segment::CreateSegment;
use x121_db::repositories::{ComfyUIInstanceRepo, JobRepo, SegmentRepo};
use x121_events::ActivityLogBroadcaster;

use crate::context_loader;
use crate::error::PipelineError;
use crate::gen_log;
use crate::workflow_builder::{build_workflow, GenerationContext};

/// Result of a successful workflow submission.
#[derive(Debug)]
pub struct SubmissionResult {
    /// The segment row that was created.
    pub segment_id: DbId,
    /// The platform job ID used to track this execution.
    pub job_id: DbId,
    /// The ComfyUI prompt ID returned by the server.
    pub prompt_id: String,
}

/// Submit a single segment for generation.
///
/// 1. Loads the generation context (scene type, seed image, prompts).
/// 2. Creates a segment row + platform job (visible in queue immediately).
/// 3. Picks a ComfyUI instance and uploads the seed image.
/// 4. Builds the ComfyUI workflow JSON.
/// 5. Submits the workflow to ComfyUI.
///
/// If any step after job creation fails, the job is marked as `Failed` so
/// the user can see the error in the queue UI.
///
/// The caller (loop driver) is responsible for choosing when to call this.
pub async fn submit_segment(
    pool: &sqlx::PgPool,
    comfyui: &Arc<ComfyUIManager>,
    storage: &Arc<dyn StorageProvider>,
    scene_id: DbId,
    segment_index: u32,
    user_id: DbId,
) -> Result<SubmissionResult, PipelineError> {
    submit_segment_with_broadcaster(
        pool,
        comfyui,
        storage,
        scene_id,
        segment_index,
        user_id,
        None,
    )
    .await
}

/// Submit a single segment for generation, with optional activity log broadcasting.
///
/// This is the full implementation; [`submit_segment`] delegates here with `None`.
pub async fn submit_segment_with_broadcaster(
    pool: &sqlx::PgPool,
    comfyui: &Arc<ComfyUIManager>,
    storage: &Arc<dyn StorageProvider>,
    scene_id: DbId,
    segment_index: u32,
    user_id: DbId,
    broadcaster: Option<&Arc<ActivityLogBroadcaster>>,
) -> Result<SubmissionResult, PipelineError> {
    // 1. Load context.
    let ctx = context_loader::load_generation_context(pool, scene_id, segment_index).await?;
    gen_log::log(
        pool,
        scene_id,
        "info",
        format!("Loading generation context for segment {segment_index}"),
    )
    .await;

    // 2. Create segment row early so it's visible immediately.
    let seed_frame_path = ctx.seed_image_path.clone();
    let segment = SegmentRepo::create(
        pool,
        &CreateSegment {
            scene_id,
            sequence_index: segment_index as i32,
            status_id: None, // defaults to 1 (Pending)
            seed_frame_path: Some(seed_frame_path),
            output_video_path: None,
            last_frame_path: None,
            quality_scores: None,
            duration_secs: None,
            cumulative_duration_secs: None,
            boundary_frame_index: None,
            boundary_selection_mode: None,
            generation_started_at: Some(chrono::Utc::now()),
            generation_completed_at: None,
            worker_id: None,
            prompt_type: None,
            prompt_text: None,
        },
    )
    .await
    .map_err(PipelineError::Database)?;
    gen_log::log(
        pool,
        scene_id,
        "info",
        format!("Created segment record (index: {segment_index})"),
    )
    .await;

    // 3. Create platform job early so it appears in the queue immediately.
    let job = JobRepo::submit(
        pool,
        user_id,
        &x121_db::models::job::SubmitJob {
            job_type: x121_core::generation::JOB_TYPE_SEGMENT_GENERATION.to_string(),
            parameters: serde_json::to_value(SegmentJobParams {
                scene_id,
                segment_id: segment.id,
                segment_index,
            })
            .expect("SegmentJobParams serialization cannot fail"),
            priority: None,
            estimated_duration_secs: None,
            scheduled_start_at: None,
            is_off_peak_only: false,
        },
    )
    .await
    .map_err(PipelineError::Database)?;
    gen_log::log(
        pool,
        scene_id,
        "info",
        format!("Job #{} created — visible in queue", job.id),
    )
    .await;

    if let Some(b) = broadcaster {
        b.publish(
            ActivityLogEntry::curated(
                ActivityLogLevel::Info,
                ActivityLogSource::Pipeline,
                format!(
                    "Job {} submitted for scene {scene_id} segment {segment_index}",
                    job.id
                ),
            )
            .with_job(job.id)
            .with_user(user_id),
        );
    }

    // 4. Pick a ComfyUI instance, upload seed, build workflow, and submit.
    //    If anything fails, mark the job as Failed so it's visible in the queue
    //    with the error message.
    match submit_to_comfyui(
        pool,
        comfyui,
        storage,
        &ctx,
        &segment,
        &job,
        scene_id,
        segment_index,
    )
    .await
    {
        Ok(prompt_id) => {
            if let Some(b) = broadcaster {
                b.publish(
                    ActivityLogEntry::curated(
                        ActivityLogLevel::Info,
                        ActivityLogSource::Pipeline,
                        format!("Job {} dispatched to ComfyUI", job.id),
                    )
                    .with_job(job.id),
                );
            }
            Ok(SubmissionResult {
                segment_id: segment.id,
                job_id: job.id,
                prompt_id,
            })
        }
        Err(e) => {
            // Mark the job as failed so the user sees the error in the queue.
            let _ = JobRepo::fail(pool, job.id, &e.to_string(), None).await;
            Err(e)
        }
    }
}

/// Inner function that handles all ComfyUI interaction after segment + job
/// are already created. Separated so we can catch errors and mark the job
/// as failed.
async fn submit_to_comfyui(
    pool: &sqlx::PgPool,
    comfyui: &Arc<ComfyUIManager>,
    storage: &Arc<dyn StorageProvider>,
    ctx: &GenerationContext,
    segment: &x121_db::models::segment::Segment,
    job: &x121_db::models::job::Job,
    scene_id: DbId,
    segment_index: u32,
) -> Result<String, PipelineError> {
    // Pick the least-loaded, non-draining instance (PRD-132).
    let instance_id = pick_instance(pool, comfyui).await?;
    let api = comfyui
        .api_for_instance(instance_id)
        .await
        .ok_or_else(|| PipelineError::ComfyUI("Instance disconnected after selection".into()))?;

    // Track which instance this job is assigned to (PRD-132).
    JobRepo::assign_instance(pool, job.id, instance_id)
        .await
        .map_err(PipelineError::Database)?;

    gen_log::log(
        pool,
        scene_id,
        "info",
        format!("Selected ComfyUI instance {instance_id} for processing"),
    )
    .await;

    // Upload seed image to ComfyUI.
    let seed_filename = std::path::Path::new(&ctx.seed_image_path)
        .file_name()
        .map(|f| f.to_string_lossy().to_string())
        .unwrap_or_else(|| format!("seed_{scene_id}_{segment_index}.png"));

    let image_bytes = storage.download(&ctx.seed_image_path).await.map_err(|e| {
        PipelineError::Download(format!(
            "Failed to read seed image '{}': {e}",
            ctx.seed_image_path
        ))
    })?;

    let upload_result = api
        .upload_image(&seed_filename, image_bytes, true)
        .await
        .map_err(|e| PipelineError::ComfyUI(format!("Failed to upload seed image: {e}")))?;

    tracing::debug!(
        scene_id,
        segment_index,
        comfyui_filename = %upload_result.name,
        "Seed image uploaded to ComfyUI",
    );
    gen_log::log(pool, scene_id, "info", "Uploaded seed image to ComfyUI").await;

    // Build workflow.
    let workflow = build_workflow(ctx)?;
    gen_log::log(pool, scene_id, "info", "Built workflow from template").await;

    // Submit the workflow to ComfyUI.
    let prompt_id = comfyui
        .submit_workflow(instance_id, &workflow, job.id)
        .await
        .map_err(|e| PipelineError::ComfyUI(e.to_string()))?;

    tracing::info!(
        scene_id,
        segment_id = segment.id,
        job_id = job.id,
        %prompt_id,
        segment_index,
        "Segment workflow submitted to ComfyUI",
    );
    gen_log::log(
        pool,
        scene_id,
        "success",
        format!("Submitted segment {segment_index} to ComfyUI (prompt_id: {prompt_id})"),
    )
    .await;

    Ok(prompt_id)
}

/// Pick the least-loaded, non-draining ComfyUI instance (PRD-132).
///
/// 1. Gets connected instance IDs from the manager.
/// 2. Filters out draining instances via the database.
/// 3. Queries active job counts per instance.
/// 4. Selects the instance with the fewest active jobs.
///
/// If no instances are connected, attempts a refresh from the database
/// in case the worker process has registered new instances since startup.
async fn pick_instance(
    pool: &sqlx::PgPool,
    comfyui: &ComfyUIManager,
) -> Result<DbId, PipelineError> {
    let mut connected_ids = comfyui.connected_instance_ids().await;

    if connected_ids.is_empty() {
        // No instances — try refreshing from DB (worker may have registered one).
        tracing::info!("No ComfyUI instances connected — refreshing from database");
        comfyui.refresh_instances().await;

        // Wait a moment for the WebSocket connection to establish.
        tokio::time::sleep(std::time::Duration::from_secs(3)).await;

        connected_ids = comfyui.connected_instance_ids().await;
        if connected_ids.is_empty() {
            return Err(PipelineError::ComfyUI(
                "No ComfyUI instances connected".to_string(),
            ));
        }
    }

    // Filter out draining instances by querying DB for non-draining ones.
    let eligible = ComfyUIInstanceRepo::list_enabled_non_draining(pool)
        .await
        .map_err(PipelineError::Database)?;

    let eligible_ids: Vec<DbId> = eligible
        .iter()
        .filter(|inst| connected_ids.contains(&inst.id))
        .map(|inst| inst.id)
        .collect();

    if eligible_ids.is_empty() {
        return Err(PipelineError::ComfyUI(
            "No non-draining ComfyUI instances available".to_string(),
        ));
    }

    // Query active job counts per eligible instance.
    let loads = JobRepo::active_jobs_by_instance(pool, &eligible_ids)
        .await
        .map_err(PipelineError::Database)?;

    // Select instance with fewest active jobs. On tie, first (lowest ID) wins.
    loads
        .into_iter()
        .min_by_key(|&(id, count)| (count, id))
        .map(|(id, _)| id)
        .ok_or_else(|| PipelineError::ComfyUI("No eligible ComfyUI instances found".to_string()))
}
