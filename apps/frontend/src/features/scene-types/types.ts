/**
 * Scene type configuration types (PRD-23).
 */

export interface SceneType {
  id: number;
  project_id: number | null;
  name: string;
  status_id: number;
  description: string | null;
  workflow_json: unknown | null;
  lora_config: unknown | null;
  model_config: unknown | null;
  prompt_template: string | null;
  negative_prompt_template: string | null;
  prompt_start_clip: string | null;
  negative_prompt_start_clip: string | null;
  prompt_continuation_clip: string | null;
  negative_prompt_continuation_clip: string | null;
  target_duration_secs: number | null;
  segment_duration_secs: number | null;
  duration_tolerance_secs: number;
  variant_applicability: string;
  transition_segment_index: number | null;
  generation_params: unknown | null;
  sort_order: number;
  is_active: boolean;
  is_studio_level: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateSceneType {
  name: string;
  project_id?: number | null;
  description?: string | null;
  status_id?: number | null;
  workflow_json?: unknown | null;
  lora_config?: unknown | null;
  model_config?: unknown | null;
  prompt_template?: string | null;
  negative_prompt_template?: string | null;
  prompt_start_clip?: string | null;
  negative_prompt_start_clip?: string | null;
  prompt_continuation_clip?: string | null;
  negative_prompt_continuation_clip?: string | null;
  target_duration_secs?: number | null;
  segment_duration_secs?: number | null;
  duration_tolerance_secs?: number | null;
  variant_applicability?: string | null;
  transition_segment_index?: number | null;
  generation_params?: unknown | null;
  sort_order?: number | null;
  is_active?: boolean | null;
  is_studio_level?: boolean | null;
}

export interface UpdateSceneType {
  name?: string;
  description?: string | null;
  status_id?: number | null;
  workflow_json?: unknown | null;
  lora_config?: unknown | null;
  model_config?: unknown | null;
  prompt_template?: string | null;
  negative_prompt_template?: string | null;
  prompt_start_clip?: string | null;
  negative_prompt_start_clip?: string | null;
  prompt_continuation_clip?: string | null;
  negative_prompt_continuation_clip?: string | null;
  target_duration_secs?: number | null;
  segment_duration_secs?: number | null;
  duration_tolerance_secs?: number | null;
  variant_applicability?: string | null;
  transition_segment_index?: number | null;
  generation_params?: unknown | null;
  sort_order?: number | null;
  is_active?: boolean | null;
  is_studio_level?: boolean | null;
}

export interface PromptPreviewResponse {
  positive_prompt: string;
  negative_prompt: string;
  unresolved_placeholders: string[];
  source: string;
}

export interface MatrixCell {
  character_id: number;
  scene_type_id: number;
  variant_type: string;
  existing_scene_id: number | null;
  status: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export const VARIANT_OPTIONS = [
  { value: "clothed", label: "Clothed only" },
  { value: "topless", label: "Topless only" },
  { value: "both", label: "Both variants" },
  { value: "clothes_off", label: "Clothes off (transition)" },
] as const;

export const CLIP_POSITIONS = [
  "full_clip",
  "start_clip",
  "continuation_clip",
] as const;
