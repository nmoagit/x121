//! Submit a segment's workflow to ComfyUI for generation.
//!
//! Orchestrates: load context → upload seed image → build workflow →
//! create DB records → submit to ComfyUI instance via the manager.

use std::sync::Arc;

use x121_comfyui::manager::ComfyUIManager;
use x121_core::storage::StorageProvider;
use x121_core::types::DbId;
use x121_db::models::generation::SegmentJobParams;
use x121_db::models::segment::CreateSegment;
use x121_db::repositories::{JobRepo, SegmentRepo};

use crate::context_loader;
use crate::error::PipelineError;
use crate::workflow_builder::build_workflow;

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
/// 2. Reads the seed image from storage and uploads it to ComfyUI.
/// 3. Builds the ComfyUI workflow JSON.
/// 4. Creates a segment row in `pending` status.
/// 5. Creates a platform job to track the execution.
/// 6. Submits the workflow to a ComfyUI instance.
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
    // 1. Load context.
    let ctx = context_loader::load_generation_context(pool, scene_id, segment_index).await?;

    // 2. Pick an instance early so we can upload the seed image to it.
    let instance_id = pick_instance(comfyui).await?;
    let api = comfyui
        .api_for_instance(instance_id)
        .await
        .ok_or_else(|| PipelineError::ComfyUI("Instance disconnected after selection".into()))?;

    // 3. Upload seed image to ComfyUI.
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

    // 4. Build workflow (uses the seed_image_path which the workflow_builder
    //    maps to the LoadImage node's `image` field — the filename on ComfyUI
    //    matches what we uploaded).
    let workflow = build_workflow(&ctx)?;

    // 5. Determine seed frame path for the segment record.
    let seed_frame_path = ctx.seed_image_path.clone();

    // 6. Create segment row.
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

    // 7. Create a platform job to track this execution.
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

    // 8. Submit the workflow to ComfyUI.
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

    Ok(SubmissionResult {
        segment_id: segment.id,
        job_id: job.id,
        prompt_id,
    })
}

/// Pick the first available ComfyUI instance.
///
/// Future improvement: load-balancing, affinity, etc.
async fn pick_instance(comfyui: &ComfyUIManager) -> Result<DbId, PipelineError> {
    let ids = comfyui.connected_instance_ids().await;
    ids.into_iter()
        .next()
        .ok_or_else(|| PipelineError::ComfyUI("No ComfyUI instances connected".to_string()))
}
