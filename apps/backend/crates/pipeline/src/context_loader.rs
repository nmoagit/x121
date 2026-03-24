//! Load generation context from the database.
//!
//! Fetches all data needed to build a ComfyUI workflow for a given scene
//! and segment index: scene type, image variant, previous segment,
//! resolved prompts, and resolved video settings.

use std::collections::HashMap;

use x121_core::generation;
use x121_core::media_resolution::{self, MediaAssignmentInput, MediaSlotInput};
use x121_core::prompt_resolution;
use x121_core::types::DbId;
use x121_core::video_settings::{self, VideoSettingsLayer};
use x121_db::models::pipeline::Pipeline;
use x121_db::repositories::{
    AvatarMediaAssignmentRepo, AvatarRepo, ImageVariantRepo, PipelineRepo, ProjectRepo,
    SceneTypeTrackConfigRepo, SegmentRepo, VideoSettingsRepo, WorkflowMediaSlotRepo, WorkflowRepo,
};

use crate::error::{load_scene_and_type, PipelineError};
use crate::workflow_builder::GenerationContext;

/// Load the pipeline configuration for a given project.
///
/// Resolves the project's `pipeline_id` and fetches the corresponding
/// `Pipeline` record. Returns an error if the project is not found, has
/// no pipeline assigned, or the pipeline itself is missing or inactive.
pub async fn load_pipeline_for_project(
    pool: &sqlx::PgPool,
    project_id: DbId,
) -> Result<Pipeline, PipelineError> {
    let project = ProjectRepo::find_by_id(pool, project_id)
        .await?
        .ok_or_else(|| PipelineError::MissingConfig(format!("Project {project_id} not found")))?;

    let pipeline = PipelineRepo::find_by_id(pool, project.pipeline_id)
        .await?
        .ok_or_else(|| {
            PipelineError::MissingConfig(format!(
                "Pipeline {} not found for project {project_id}",
                project.pipeline_id
            ))
        })?;

    if !pipeline.is_active {
        return Err(PipelineError::MissingConfig(format!(
            "Pipeline {} ({}) is inactive",
            pipeline.id, pipeline.code
        )));
    }

    Ok(pipeline)
}

/// Load everything needed to build a ComfyUI workflow for one segment.
pub async fn load_generation_context(
    pool: &sqlx::PgPool,
    scene_id: DbId,
    segment_index: u32,
) -> Result<GenerationContext, PipelineError> {
    // 1. Load the scene and scene type.
    let (scene, scene_type) = load_scene_and_type(pool, scene_id).await?;

    // Resolve workflow. Priority:
    // 1. Track config workflow (scene_type_track_configs — per scene_type × track)
    // 2. Scene type's linked workflow (scene_types.workflow_id)
    // 3. Scene type's inline workflow JSON (scene_types.workflow_json)
    let resolved_workflow_id = if let Some(track_id) = scene.track_id {
        // Check track config first.
        let track_config = SceneTypeTrackConfigRepo::find_by_scene_type_and_track(
            pool,
            scene.scene_type_id,
            track_id,
            false, // TODO: resolve is_clothes_off from scene context
        )
        .await?;
        track_config
            .and_then(|c| c.workflow_id)
            .or(scene_type.workflow_id)
    } else {
        scene_type.workflow_id
    };

    let workflow_template = if let Some(wf_id) = resolved_workflow_id {
        let workflow = WorkflowRepo::find_by_id(pool, wf_id)
            .await?
            .ok_or_else(|| PipelineError::MissingConfig(format!("Workflow {wf_id} not found")))?;
        workflow.json_content
    } else if let Some(ref json) = scene_type.workflow_json {
        json.clone()
    } else {
        return Err(PipelineError::MissingConfig(format!(
            "No workflow configured for SceneType {} (checked track config, scene_type.workflow_id, and workflow_json)",
            scene.scene_type_id
        )));
    };

    // 2. Determine the seed image path (legacy) and resolve media slots (PRD-146).
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
        let prev_segment = SegmentRepo::find_by_scene_and_index(pool, scene_id, prev_index)
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

    // 2b. Resolve media slots via PRD-146 engine (only for first segment).
    let resolved_media = if segment_index == 0 {
        resolve_media_for_scene(
            pool,
            resolved_workflow_id,
            scene.avatar_id,
            scene.scene_type_id,
        )
        .await?
    } else {
        // Continuation segments use boundary frames, not media slots.
        vec![]
    };

    // 3. Resolve video settings through the 4-level hierarchy.
    let scene_type_layer = VideoSettingsLayer {
        target_duration_secs: scene_type.target_duration_secs,
        target_fps: scene_type.target_fps,
        target_resolution: scene_type.target_resolution.clone(),
    };

    // Load avatar for project_id and group_id.
    let avatar = AvatarRepo::find_by_id(pool, scene.avatar_id)
        .await?
        .ok_or_else(|| {
            PipelineError::MissingConfig(format!(
                "Avatar {} not found for scene {scene_id}",
                scene.avatar_id
            ))
        })?;

    let (project_layer, group_layer, char_layer) = VideoSettingsRepo::load_hierarchy_layers(
        pool,
        avatar.project_id,
        avatar.group_id,
        scene.avatar_id,
        scene.scene_type_id,
    )
    .await?;

    let is_idle = scene_type.name.to_lowercase() == "idle";
    let resolved_video_settings = video_settings::resolve_video_settings(
        &scene_type_layer,
        project_layer.as_ref(),
        group_layer.as_ref(),
        char_layer.as_ref(),
        is_idle,
    );

    // 4. Determine clip position and segment estimate using resolved duration.
    let target_duration = resolved_video_settings.duration_secs as f64;
    let estimated_total =
        generation::estimate_segments(target_duration, generation::DEFAULT_SEGMENT_DURATION_SECS);
    let clip_position = generation::determine_clip_position(segment_index, estimated_total);

    // 5. Resolve prompts (MVP: empty overrides — will be wired to real data later).
    let resolved_prompts = prompt_resolution::resolve_prompts(
        &[],             // prompt_slots — will load from workflow_prompt_slots later
        &HashMap::new(), // scene_type_defaults
        &HashMap::new(), // avatar_metadata
        &HashMap::new(), // project_fragment_overrides
        &HashMap::new(), // group_fragment_overrides
        &HashMap::new(), // avatar_fragment_overrides
        None,            // fragment_separator
    );

    Ok(GenerationContext {
        scene_id,
        segment_index,
        clip_position,
        seed_image_path,
        resolved_media,
        workflow_template,
        resolved_prompts,
        generation_params: scene_type.generation_params,
        lora_config: scene_type.lora_config,
        resolved_video_settings,
    })
}

/// Resolve media slots for a scene's workflow and avatar (PRD-146).
///
/// Queries `workflow_media_slots` for the workflow, `avatar_media_assignments`
/// for the avatar, resolves image variant IDs to file paths, then runs the
/// pure resolution engine.
///
/// Returns an empty vec when no media slots are configured (backward compat),
/// allowing the caller to fall back to the legacy single-seed-image path.
async fn resolve_media_for_scene(
    pool: &sqlx::PgPool,
    workflow_id: Option<DbId>,
    avatar_id: DbId,
    scene_type_id: DbId,
) -> Result<Vec<media_resolution::ResolvedMediaSlot>, PipelineError> {
    let Some(wf_id) = workflow_id else {
        // No linked workflow — no media slots to resolve.
        return Ok(vec![]);
    };

    // 1. Load media slots for this workflow.
    let db_slots = WorkflowMediaSlotRepo::list_by_workflow(pool, wf_id).await?;
    if db_slots.is_empty() {
        return Ok(vec![]);
    }

    // 2. Load avatar assignments for media resolution.
    let db_assignments = AvatarMediaAssignmentRepo::list_for_resolution(pool, avatar_id).await?;

    // 3. Collect all referenced image_variant_ids and batch-fetch their file paths.
    let variant_ids: Vec<DbId> = db_assignments
        .iter()
        .filter_map(|a| a.image_variant_id)
        .collect();

    let mut variant_paths: HashMap<DbId, String> = HashMap::new();
    for variant_id in &variant_ids {
        if let Some(variant) = ImageVariantRepo::find_by_id(pool, *variant_id).await? {
            variant_paths.insert(variant.id, variant.file_path);
        }
    }

    // 4. Convert DB models to resolution engine input types.
    let slot_inputs: Vec<MediaSlotInput> = db_slots
        .iter()
        .map(|s| MediaSlotInput {
            id: s.id,
            node_id: s.node_id.clone(),
            input_name: s.input_name.clone(),
            class_type: s.class_type.clone(),
            slot_label: s.slot_label.clone(),
            media_type: s.media_type.clone(),
            is_required: s.is_required,
            fallback_mode: s.fallback_mode.clone(),
            fallback_value: s.fallback_value.clone(),
        })
        .collect();

    let assignment_inputs: Vec<MediaAssignmentInput> = db_assignments
        .iter()
        .map(|a| MediaAssignmentInput {
            media_slot_id: a.media_slot_id,
            scene_type_id: a.scene_type_id,
            image_variant_id: a.image_variant_id,
            file_path: a.file_path.clone(),
            is_passthrough: a.is_passthrough,
            passthrough_track_id: a.passthrough_track_id,
        })
        .collect();

    // 5. Run resolution.
    match media_resolution::resolve_media_slots(
        &slot_inputs,
        &assignment_inputs,
        scene_type_id,
        &variant_paths,
    ) {
        Ok(resolved) => Ok(resolved),
        Err(unresolved) => {
            let missing_labels: Vec<String> =
                unresolved.iter().map(|u| u.slot_label.clone()).collect();
            Err(PipelineError::MissingConfig(format!(
                "Unresolved required media slots for avatar {avatar_id}: {}",
                missing_labels.join(", ")
            )))
        }
    }
}
