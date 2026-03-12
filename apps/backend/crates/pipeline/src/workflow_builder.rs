//! Build ComfyUI workflow JSON from a generation context.
//!
//! Takes a workflow template, seed image path, resolved prompts, and optional
//! parameter overrides and produces a ready-to-submit workflow JSON.

use std::path::Path;

use x121_core::prompt_resolution::ResolvedPromptSlot;
use x121_core::scene_type_config::ClipPosition;
use x121_core::types::DbId;
use x121_core::video_settings::ResolvedVideoSettings;
use x121_core::workflow_import::LOAD_IMAGE_CLASSES;

use crate::error::PipelineError;

/// Everything needed to prepare a ComfyUI workflow for one segment.
pub struct GenerationContext {
    pub scene_id: DbId,
    pub segment_index: u32,
    pub clip_position: ClipPosition,
    /// Path to the seed image (variant file for segment 0, boundary frame for continuations).
    pub seed_image_path: String,
    /// The workflow template JSON from scene_type.workflow_json.
    pub workflow_template: serde_json::Value,
    /// Resolved prompt texts for each slot.
    pub resolved_prompts: Vec<ResolvedPromptSlot>,
    /// Optional generation parameter overrides (e.g. `{"3.cfg": 7.5, "3.steps": 20}`).
    pub generation_params: Option<serde_json::Value>,
    /// Optional LoRA configuration.
    pub lora_config: Option<serde_json::Value>,
    /// Resolved video settings from the 4-level hierarchy.
    pub resolved_video_settings: ResolvedVideoSettings,
}

/// Build a ready-to-submit ComfyUI workflow from the generation context.
///
/// 1. Clones the template
/// 2. Sets the seed image filename on the LoadImage node
/// 3. Injects resolved prompt texts into their target nodes
/// 4. Applies generation parameter overrides
pub fn build_workflow(ctx: &GenerationContext) -> Result<serde_json::Value, PipelineError> {
    let mut workflow = ctx.workflow_template.clone();

    set_seed_image(&mut workflow, &ctx.seed_image_path)?;
    inject_prompts(&mut workflow, &ctx.resolved_prompts);
    apply_generation_params(&mut workflow, &ctx.generation_params);

    Ok(workflow)
}

/// Find the LoadImage node and set `inputs.image` to the seed image filename.
fn set_seed_image(
    workflow: &mut serde_json::Value,
    seed_image_path: &str,
) -> Result<(), PipelineError> {
    let filename = Path::new(seed_image_path)
        .file_name()
        .and_then(|f| f.to_str())
        .unwrap_or(seed_image_path);

    let nodes = workflow
        .as_object_mut()
        .ok_or_else(|| PipelineError::WorkflowBuild("Workflow is not a JSON object".into()))?;

    for (_node_id, node) in nodes.iter_mut() {
        let class_type = node
            .get("class_type")
            .and_then(|v| v.as_str())
            .unwrap_or("");

        if LOAD_IMAGE_CLASSES.contains(&class_type) {
            if let Some(inputs) = node.get_mut("inputs") {
                inputs["image"] = serde_json::Value::String(filename.to_string());
                return Ok(());
            }
        }
    }

    Err(PipelineError::WorkflowBuild(
        "No LoadImage or LoadImageFromPath node found in workflow template".into(),
    ))
}

/// Inject resolved prompt texts into their target nodes.
fn inject_prompts(workflow: &mut serde_json::Value, prompts: &[ResolvedPromptSlot]) {
    let Some(nodes) = workflow.as_object_mut() else {
        return;
    };

    for prompt in prompts {
        if let Some(node) = nodes.get_mut(&prompt.node_id) {
            if let Some(inputs) = node.get_mut("inputs") {
                inputs[&prompt.input_name] =
                    serde_json::Value::String(prompt.resolved_text.clone());
            }
        }
    }
}

/// Apply generation parameter overrides.
///
/// Parameters are formatted as `{"node_id.input_name": value}`.
fn apply_generation_params(workflow: &mut serde_json::Value, params: &Option<serde_json::Value>) {
    let Some(params) = params.as_ref().and_then(|p| p.as_object()) else {
        return;
    };
    let Some(nodes) = workflow.as_object_mut() else {
        return;
    };

    for (key, value) in params {
        if let Some((node_id, input_name)) = key.split_once('.') {
            if let Some(node) = nodes.get_mut(node_id) {
                if let Some(inputs) = node.get_mut("inputs") {
                    inputs[input_name] = value.clone();
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_workflow() -> serde_json::Value {
        serde_json::json!({
            "3": {
                "class_type": "KSampler",
                "inputs": {
                    "seed": 42,
                    "cfg": 8.0,
                    "steps": 25,
                    "sampler_name": "euler"
                }
            },
            "5": {
                "class_type": "CLIPTextEncode",
                "inputs": {
                    "text": "placeholder positive prompt"
                }
            },
            "10": {
                "class_type": "LoadImage",
                "inputs": {
                    "image": "placeholder.png"
                }
            }
        })
    }

    fn make_resolved_slot(node_id: &str, input_name: &str, text: &str) -> ResolvedPromptSlot {
        ResolvedPromptSlot {
            slot_id: 1,
            node_id: node_id.to_string(),
            input_name: input_name.to_string(),
            slot_label: "test".to_string(),
            slot_type: "positive".to_string(),
            resolved_text: text.to_string(),
            source: x121_core::prompt_resolution::PromptSource::WorkflowDefault,
            unresolved_placeholders: vec![],
            applied_fragments: vec![],
        }
    }

    #[test]
    fn test_build_workflow_sets_seed_image() {
        let ctx = GenerationContext {
            scene_id: 1,
            segment_index: 0,
            clip_position: ClipPosition::FullClip,
            seed_image_path: "/mnt/d/Storage/images/seed_001.png".to_string(),
            workflow_template: sample_workflow(),
            resolved_prompts: vec![],
            generation_params: None,
            lora_config: None,
            resolved_video_settings: x121_core::video_settings::ResolvedVideoSettings {
                duration_secs: 16,
                duration_source: x121_core::video_settings::VideoSettingSource::SystemDefault,
                fps: 30,
                fps_source: x121_core::video_settings::VideoSettingSource::SystemDefault,
                resolution: "720p".to_string(),
                resolution_source: x121_core::video_settings::VideoSettingSource::SystemDefault,
            },
        };

        let result = build_workflow(&ctx).unwrap();
        let image = result["10"]["inputs"]["image"].as_str().unwrap();
        assert_eq!(image, "seed_001.png");
    }

    #[test]
    fn test_build_workflow_errors_on_missing_load_image() {
        let workflow = serde_json::json!({
            "3": {
                "class_type": "KSampler",
                "inputs": {"seed": 42}
            }
        });

        let ctx = GenerationContext {
            scene_id: 1,
            segment_index: 0,
            clip_position: ClipPosition::FullClip,
            seed_image_path: "seed.png".to_string(),
            workflow_template: workflow,
            resolved_prompts: vec![],
            generation_params: None,
            lora_config: None,
            resolved_video_settings: x121_core::video_settings::ResolvedVideoSettings {
                duration_secs: 16,
                duration_source: x121_core::video_settings::VideoSettingSource::SystemDefault,
                fps: 30,
                fps_source: x121_core::video_settings::VideoSettingSource::SystemDefault,
                resolution: "720p".to_string(),
                resolution_source: x121_core::video_settings::VideoSettingSource::SystemDefault,
            },
        };

        let err = build_workflow(&ctx).unwrap_err();
        assert!(err.to_string().contains("No LoadImage"));
    }

    #[test]
    fn test_build_workflow_injects_prompts() {
        let ctx = GenerationContext {
            scene_id: 1,
            segment_index: 0,
            clip_position: ClipPosition::FullClip,
            seed_image_path: "seed.png".to_string(),
            workflow_template: sample_workflow(),
            resolved_prompts: vec![make_resolved_slot("5", "text", "a portrait of Alice")],
            generation_params: None,
            lora_config: None,
            resolved_video_settings: x121_core::video_settings::ResolvedVideoSettings {
                duration_secs: 16,
                duration_source: x121_core::video_settings::VideoSettingSource::SystemDefault,
                fps: 30,
                fps_source: x121_core::video_settings::VideoSettingSource::SystemDefault,
                resolution: "720p".to_string(),
                resolution_source: x121_core::video_settings::VideoSettingSource::SystemDefault,
            },
        };

        let result = build_workflow(&ctx).unwrap();
        let text = result["5"]["inputs"]["text"].as_str().unwrap();
        assert_eq!(text, "a portrait of Alice");
    }

    #[test]
    fn test_build_workflow_applies_generation_params() {
        let ctx = GenerationContext {
            scene_id: 1,
            segment_index: 0,
            clip_position: ClipPosition::FullClip,
            seed_image_path: "seed.png".to_string(),
            workflow_template: sample_workflow(),
            resolved_prompts: vec![],
            generation_params: Some(serde_json::json!({
                "3.cfg": 7.5,
                "3.steps": 20
            })),
            lora_config: None,
            resolved_video_settings: x121_core::video_settings::ResolvedVideoSettings {
                duration_secs: 16,
                duration_source: x121_core::video_settings::VideoSettingSource::SystemDefault,
                fps: 30,
                fps_source: x121_core::video_settings::VideoSettingSource::SystemDefault,
                resolution: "720p".to_string(),
                resolution_source: x121_core::video_settings::VideoSettingSource::SystemDefault,
            },
        };

        let result = build_workflow(&ctx).unwrap();
        assert_eq!(result["3"]["inputs"]["cfg"], 7.5);
        assert_eq!(result["3"]["inputs"]["steps"], 20);
    }
}
