//! Generation loop driver.
//!
//! Evaluates the stop decision after each segment completes, and either
//! submits the next segment or marks the scene as complete.

use std::sync::Arc;

use x121_comfyui::manager::ComfyUIManager;
use x121_core::generation::{self, StopDecision};
use x121_core::storage::StorageProvider;
use x121_core::types::DbId;
use x121_db::repositories::SceneRepo;

use crate::completion_handler::CompletionResult;
use crate::error::{load_scene_and_type, PipelineError};
use crate::submitter;

/// Outcome of evaluating the loop after a segment completes.
#[derive(Debug)]
pub enum LoopOutcome {
    /// Another segment was submitted for generation.
    NextSubmitted {
        segment_id: DbId,
        job_id: DbId,
        prompt_id: String,
    },
    /// The scene has reached its target duration and generation is complete.
    SceneComplete {
        scene_id: DbId,
        total_duration: f64,
    },
}

/// Evaluate whether to continue generating after a segment completes.
///
/// Uses the core `should_stop_generation` function to decide:
/// - `Continue` → submit next segment
/// - `ElasticStop` / `Stop` → mark scene complete
pub async fn evaluate_and_continue(
    pool: &sqlx::PgPool,
    comfyui: &Arc<ComfyUIManager>,
    storage: &Arc<dyn StorageProvider>,
    completion: &CompletionResult,
    user_id: DbId,
) -> Result<LoopOutcome, PipelineError> {
    // Load scene and scene type for target duration.
    let (scene, scene_type) = load_scene_and_type(pool, completion.scene_id).await?;

    let target_duration = scene_type
        .target_duration_secs
        .map(|d| d as f64)
        .unwrap_or(generation::DEFAULT_SEGMENT_DURATION_SECS);

    let decision = generation::should_stop_generation(
        completion.cumulative_duration_secs - completion.duration_secs, // previous cumulative
        target_duration,
        generation::DEFAULT_ELASTIC_TOLERANCE_SECS,
        completion.duration_secs,
    );

    match decision {
        StopDecision::Continue => {
            // Determine next segment index.
            let next_index = (scene.total_segments_completed + 1) as u32;

            tracing::info!(
                scene_id = completion.scene_id,
                next_index,
                cumulative = completion.cumulative_duration_secs,
                target = target_duration,
                "Continuing generation — submitting next segment",
            );

            let result = submitter::submit_segment(
                pool,
                comfyui,
                storage,
                completion.scene_id,
                next_index,
                user_id,
            )
            .await?;

            Ok(LoopOutcome::NextSubmitted {
                segment_id: result.segment_id,
                job_id: result.job_id,
                prompt_id: result.prompt_id,
            })
        }
        StopDecision::ElasticStop | StopDecision::Stop => {
            tracing::info!(
                scene_id = completion.scene_id,
                cumulative = completion.cumulative_duration_secs,
                target = target_duration,
                decision = ?decision,
                "Generation complete — marking scene done",
            );

            SceneRepo::mark_generation_complete(
                pool,
                completion.scene_id,
                completion.cumulative_duration_secs,
            )
            .await
            .map_err(PipelineError::Database)?;

            Ok(LoopOutcome::SceneComplete {
                scene_id: completion.scene_id,
                total_duration: completion.cumulative_duration_secs,
            })
        }
    }
}
