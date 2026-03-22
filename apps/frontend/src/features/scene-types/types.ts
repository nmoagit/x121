/**
 * Scene type configuration types (PRD-23, PRD-100).
 */

export interface SceneType {
  id: number;
  project_id: number | null;
  name: string;
  /** PRD-123: slug absorbed from scene_catalogue. */
  slug: string;
  status_id: number;
  /** Registered workflow from the workflows registry. */
  workflow_id: number | null;
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
  target_fps: number | null;
  target_resolution: string | null;
  segment_duration_secs: number | null;
  duration_tolerance_secs: number;
  transition_segment_index: number | null;
  generation_params: unknown | null;
  sort_order: number;
  is_active: boolean;
  /** PRD-123: absorbed from scene_catalogue. */
  has_clothes_off_transition: boolean;
  is_studio_level: boolean;
  /** PRD-100: parent scene type for inheritance. */
  parent_scene_type_id: number | null;
  /** PRD-100: depth in the inheritance tree (0 = root). */
  depth: number;
  generation_strategy: string;
  expected_chunks: number | null;
  chunk_output_pattern: string | null;
  // -- Auto-retry policy (PRD-71) --
  auto_retry_enabled: boolean;
  auto_retry_max_attempts: number;
  auto_retry_trigger_checks: string[] | null;
  auto_retry_seed_variation: boolean;
  auto_retry_cfg_jitter: number | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateSceneType {
  name: string;
  /** PRD-123: required slug for unified scene type. */
  slug: string;
  project_id?: number | null;
  description?: string | null;
  status_id?: number | null;
  /** Registered workflow from the workflows registry. */
  workflow_id?: number | null;
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
  target_fps?: number | null;
  target_resolution?: string | null;
  segment_duration_secs?: number | null;
  duration_tolerance_secs?: number | null;
  transition_segment_index?: number | null;
  generation_params?: unknown | null;
  sort_order?: number | null;
  is_active?: boolean | null;
  has_clothes_off_transition?: boolean | null;
  is_studio_level?: boolean | null;
  /** PRD-100: parent scene type for inheritance. */
  parent_scene_type_id?: number | null;
  generation_strategy?: string | null;
  expected_chunks?: number | null;
  chunk_output_pattern?: string | null;
  // -- Auto-retry policy (PRD-71) --
  auto_retry_enabled?: boolean | null;
  auto_retry_max_attempts?: number | null;
  auto_retry_trigger_checks?: string[] | null;
  auto_retry_seed_variation?: boolean | null;
  auto_retry_cfg_jitter?: number | null;
}

export interface UpdateSceneType {
  name?: string;
  slug?: string;
  description?: string | null;
  status_id?: number | null;
  /** Registered workflow from the workflows registry. */
  workflow_id?: number | null;
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
  target_fps?: number | null;
  target_resolution?: string | null;
  segment_duration_secs?: number | null;
  duration_tolerance_secs?: number | null;
  transition_segment_index?: number | null;
  generation_params?: unknown | null;
  sort_order?: number | null;
  is_active?: boolean | null;
  has_clothes_off_transition?: boolean | null;
  is_studio_level?: boolean | null;
  /** PRD-100: parent scene type for inheritance. */
  parent_scene_type_id?: number | null;
  /** PRD-100: depth in the inheritance tree. */
  depth?: number | null;
  generation_strategy?: string | null;
  expected_chunks?: number | null;
  chunk_output_pattern?: string | null;
  // -- Auto-retry policy (PRD-71) --
  auto_retry_enabled?: boolean | null;
  auto_retry_max_attempts?: number | null;
  auto_retry_trigger_checks?: string[] | null;
  auto_retry_seed_variation?: boolean | null;
  auto_retry_cfg_jitter?: number | null;
}

export interface PromptPreviewResponse {
  positive_prompt: string;
  negative_prompt: string;
  unresolved_placeholders: string[];
  source: string;
}

export interface MatrixCell {
  avatar_id: number;
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

export const CLIP_POSITIONS = [
  "full_clip",
  "start_clip",
  "continuation_clip",
] as const;

/* --------------------------------------------------------------------------
   PRD-100: Scene type inheritance & composition types
   -------------------------------------------------------------------------- */

export interface SceneTypeOverride {
  id: number;
  scene_type_id: number;
  field_name: string;
  override_value: unknown;
  created_at: string;
  updated_at: string;
}

export interface UpsertOverride {
  field_name: string;
  override_value: unknown;
}

export interface Mixin {
  id: number;
  name: string;
  description: string | null;
  parameters: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface CreateMixin {
  name: string;
  description?: string | null;
  parameters?: Record<string, unknown>;
}

export interface UpdateMixin {
  name?: string;
  description?: string | null;
  parameters?: Record<string, unknown>;
}

export interface ApplyMixin {
  mixin_id: number;
  apply_order?: number;
}

export interface FieldSource {
  type: "own" | "inherited" | "mixin";
  from_id?: number;
  from_name?: string;
  mixin_id?: number;
  mixin_name?: string;
}

export interface ResolvedField {
  value: unknown;
  source: FieldSource;
}

export interface EffectiveConfig {
  scene_type_id: number;
  fields: Record<string, ResolvedField>;
}
