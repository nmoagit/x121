//! Build generation snapshot JSON for scene video versions.
//!
//! A generation snapshot captures all the inputs and parameters used to
//! produce a particular video version, enabling reproducibility and
//! debugging.

use x121_core::types::DbId;

use crate::workflow_builder::GenerationContext;

/// Build a generation snapshot JSON from the generation context.
///
/// The snapshot captures:
/// - Scene type name and clip position
/// - Seed image path
/// - Segment index
/// - Resolved prompt texts (keyed by slot label)
/// - Generation parameters and LoRA config (if any)
/// - ComfyUI instance ID
/// - Timestamp
pub fn build_generation_snapshot(
    ctx: &GenerationContext,
    instance_id: DbId,
    scene_type_name: &str,
) -> serde_json::Value {
    let mut prompts = serde_json::Map::new();
    for slot in &ctx.resolved_prompts {
        prompts.insert(
            slot.slot_label.clone(),
            serde_json::Value::String(slot.resolved_text.clone()),
        );
    }

    serde_json::json!({
        "scene_type": scene_type_name,
        "clip_position": ctx.clip_position.as_str(),
        "seed_image": ctx.seed_image_path,
        "segment_index": ctx.segment_index,
        "prompts": prompts,
        "generation_params": ctx.generation_params,
        "lora_config": ctx.lora_config,
        "comfyui_instance_id": instance_id,
        "generated_at": chrono::Utc::now().to_rfc3339(),
    })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use x121_core::prompt_resolution::{PromptSource, ResolvedPromptSlot};
    use x121_core::scene_type_config::ClipPosition;

    fn make_context() -> GenerationContext {
        GenerationContext {
            scene_id: 42,
            segment_index: 0,
            clip_position: ClipPosition::FullClip,
            seed_image_path: "/storage/images/seed_001.png".to_string(),
            resolved_media: vec![],
            workflow_template: serde_json::json!({}),
            resolved_prompts: vec![
                ResolvedPromptSlot {
                    slot_id: 1,
                    node_id: "5".to_string(),
                    input_name: "text".to_string(),
                    slot_label: "positive".to_string(),
                    slot_type: "positive".to_string(),
                    resolved_text: "a portrait of Alice".to_string(),
                    source: PromptSource::WorkflowDefault,
                    unresolved_placeholders: vec![],
                    applied_fragments: vec![],
                },
                ResolvedPromptSlot {
                    slot_id: 2,
                    node_id: "6".to_string(),
                    input_name: "text".to_string(),
                    slot_label: "negative".to_string(),
                    slot_type: "negative".to_string(),
                    resolved_text: "blurry, low quality".to_string(),
                    source: PromptSource::WorkflowDefault,
                    unresolved_placeholders: vec![],
                    applied_fragments: vec![],
                },
            ],
            generation_params: Some(serde_json::json!({"3.cfg": 7.5})),
            lora_config: None,
            resolved_video_settings: x121_core::video_settings::ResolvedVideoSettings {
                duration_secs: 16,
                duration_source: x121_core::video_settings::VideoSettingSource::SystemDefault,
                fps: 30,
                fps_source: x121_core::video_settings::VideoSettingSource::SystemDefault,
                resolution: "720p".to_string(),
                resolution_source: x121_core::video_settings::VideoSettingSource::SystemDefault,
            },
        }
    }

    #[test]
    fn snapshot_contains_all_fields() {
        let ctx = make_context();
        let snapshot = build_generation_snapshot(&ctx, 99, "talking_head");

        assert_eq!(snapshot["scene_type"], "talking_head");
        assert_eq!(snapshot["clip_position"], "full_clip");
        assert_eq!(snapshot["seed_image"], "/storage/images/seed_001.png");
        assert_eq!(snapshot["segment_index"], 0);
        assert_eq!(snapshot["comfyui_instance_id"], 99);

        // Prompts map
        let prompts = snapshot["prompts"].as_object().unwrap();
        assert_eq!(prompts["positive"], "a portrait of Alice");
        assert_eq!(prompts["negative"], "blurry, low quality");

        // Generation params
        assert_eq!(snapshot["generation_params"]["3.cfg"], 7.5);

        // LoRA config is null when not set.
        assert!(snapshot["lora_config"].is_null());

        // Timestamp is present.
        assert!(snapshot["generated_at"].as_str().is_some());
    }

    #[test]
    fn snapshot_clip_positions() {
        let mut ctx = make_context();

        ctx.clip_position = ClipPosition::StartClip;
        let snap = build_generation_snapshot(&ctx, 1, "test");
        assert_eq!(snap["clip_position"], "start_clip");

        ctx.clip_position = ClipPosition::ContinuationClip;
        let snap = build_generation_snapshot(&ctx, 1, "test");
        assert_eq!(snap["clip_position"], "continuation_clip");
    }
}
