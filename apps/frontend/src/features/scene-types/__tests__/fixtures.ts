/**
 * Shared test fixtures for scene-types feature tests.
 */

import type { SceneType } from "../types";

/** Create a SceneType with sensible defaults; override any field via `overrides`. */
export function makeSceneType(
  overrides: Partial<SceneType> & { id: number; name: string },
): SceneType {
  return {
    project_id: null,
    slug: overrides.name.toLowerCase().replace(/\s+/g, "_"),
    status_id: 1,
    workflow_id: null,
    description: null,
    workflow_json: null,
    lora_config: null,
    model_config: null,
    prompt_template: null,
    negative_prompt_template: null,
    prompt_start_clip: null,
    negative_prompt_start_clip: null,
    prompt_continuation_clip: null,
    negative_prompt_continuation_clip: null,
    target_duration_secs: null,
    target_fps: null,
    target_resolution: null,
    segment_duration_secs: null,
    duration_tolerance_secs: 2,
    transition_segment_index: null,
    generation_params: null,
    sort_order: 0,
    is_active: true,
    has_clothes_off_transition: false,
    is_studio_level: true,
    parent_scene_type_id: null,
    depth: 0,
    generation_strategy: "platform_orchestrated",
    expected_chunks: null,
    chunk_output_pattern: null,
    auto_retry_enabled: false,
    auto_retry_max_attempts: 3,
    auto_retry_trigger_checks: null,
    auto_retry_seed_variation: true,
    auto_retry_cfg_jitter: null,
    deleted_at: null,
    created_at: "2026-02-28T00:00:00Z",
    updated_at: "2026-02-28T00:00:00Z",
    ...overrides,
  };
}
