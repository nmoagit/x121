//! Submit a segment's workflow to ComfyUI for generation.
//!
//! Orchestrates: load context → build workflow → create DB records →
//! submit to ComfyUI instance via the manager.

use std::sync::Arc;

use x121_comfyui::manager::ComfyUIManager;
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
/// 2. Builds the ComfyUI workflow JSON.
/// 3. Creates a segment row in `pending` status.
/// 4. Creates a platform job to track the execution.
/// 5. Submits the workflow to a ComfyUI instance.
///
/// The caller (loop driver) is responsible for choosing when to call this.
pub async fn submit_segment(
    pool: &sqlx::PgPool,
    comfyui: &Arc<ComfyUIManager>,
    scene_id: DbId,
    segment_index: u32,
    user_id: DbId,
) -> Result<SubmissionResult, PipelineError> {
    // 1. Load context and build workflow.
    let ctx = context_loader::load_generation_context(pool, scene_id, segment_index).await?;
    let workflow = build_workflow(&ctx)?;

    // 2. Determine seed frame path for the segment record.
    let seed_frame_path = ctx.seed_image_path.clone();

    // 3. Create segment row.
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

    // 4. Create a platform job to track this execution.
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

    // 5. Pick an available ComfyUI instance and submit.
    let instance_id = pick_instance(comfyui).await?;
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
