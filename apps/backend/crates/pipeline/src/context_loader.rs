//! Load generation context from the database.
//!
//! Fetches all data needed to build a ComfyUI workflow for a given scene
//! and segment index: scene type, image variant, previous segment, and
//! resolved prompts.

use std::collections::HashMap;

use x121_core::generation;
use x121_core::prompt_resolution;
use x121_core::types::DbId;
use x121_db::repositories::{ImageVariantRepo, SceneRepo, SceneTypeRepo, SegmentRepo};

use crate::error::PipelineError;
use crate::workflow_builder::GenerationContext;

/// Load everything needed to build a ComfyUI workflow for one segment.
pub async fn load_generation_context(
    pool: &sqlx::PgPool,
    scene_id: DbId,
    segment_index: u32,
) -> Result<GenerationContext, PipelineError> {
    // 1. Load the scene.
    let scene = SceneRepo::find_by_id(pool, scene_id)
        .await?
        .ok_or_else(|| PipelineError::MissingConfig(format!("Scene {scene_id} not found")))?;

    // 2. Load the scene type for workflow template and config.
    let scene_type = SceneTypeRepo::find_by_id(pool, scene.scene_type_id)
        .await?
        .ok_or_else(|| {
            PipelineError::MissingConfig(format!(
                "SceneType {} not found",
                scene.scene_type_id
            ))
        })?;

    let workflow_template = scene_type.workflow_json.ok_or_else(|| {
        PipelineError::MissingConfig(format!(
            "SceneType {} has no workflow_json configured",
            scene.scene_type_id
        ))
    })?;

    // 3. Determine the seed image path.
    let seed_image_path = if segment_index == 0 {
        // First segment: use the image variant assigned to the scene.
        let variant_id = scene.image_variant_id.ok_or_else(|| {
            PipelineError::MissingConfig(format!(
                "Scene {scene_id} has no image_variant_id assigned"
            ))
        })?;
        let variant = ImageVariantRepo::find_by_id(pool, variant_id)
            .await?
            .ok_or_else(|| {
                PipelineError::MissingConfig(format!("ImageVariant {variant_id} not found"))
            })?;
        variant.file_path
    } else {
        // Continuation: use the previous segment's last frame.
        let prev_index = (segment_index - 1) as i32;
        let prev_segment =
            SegmentRepo::find_by_scene_and_index(pool, scene_id, prev_index)
                .await?
                .ok_or_else(|| {
                    PipelineError::MissingConfig(format!(
                        "Previous segment (index {prev_index}) not found for scene {scene_id}"
                    ))
                })?;
        prev_segment.last_frame_path.ok_or_else(|| {
            PipelineError::MissingConfig(format!(
                "Previous segment (index {prev_index}) has no last_frame_path"
            ))
        })?
    };

    // 4. Determine clip position and segment estimate.
    let target_duration = scene_type.target_duration_secs.map(|d| d as f64);
    let estimated_total = generation::estimate_segments(
        target_duration.unwrap_or(generation::DEFAULT_SEGMENT_DURATION_SECS),
        generation::DEFAULT_SEGMENT_DURATION_SECS,
    );
    let clip_position = generation::determine_clip_position(segment_index, estimated_total);

    // 5. Resolve prompts (MVP: empty overrides — will be wired to real data later).
    let resolved_prompts = prompt_resolution::resolve_prompts(
        &[],                    // prompt_slots — will load from workflow_prompt_slots later
        &HashMap::new(),        // scene_type_defaults
        &HashMap::new(),        // character_metadata
        &HashMap::new(),        // fragment_overrides
        None,                   // fragment_separator
    );

    Ok(GenerationContext {
        scene_id,
        segment_index,
        clip_position,
        seed_image_path,
        workflow_template,
        resolved_prompts,
        generation_params: scene_type.generation_params,
        lora_config: scene_type.lora_config,
    })
}
