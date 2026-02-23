/**
 * Generation Provenance & Asset Versioning types (PRD-69).
 */

/* --------------------------------------------------------------------------
   Entity types
   -------------------------------------------------------------------------- */

/** An immutable generation receipt from the server. */
export interface GenerationReceipt {
  id: number;
  segment_id: number;
  source_image_hash: string;
  variant_image_hash: string;
  workflow_version: string;
  workflow_hash: string;
  model_asset_id: number | null;
  model_version: string;
  model_hash: string;
  lora_configs: LoraConfig[];
  prompt_text: string;
  negative_prompt: string | null;
  cfg_scale: number;
  seed: number;
  resolution_width: number;
  resolution_height: number;
  steps: number;
  sampler: string;
  additional_params: Record<string, unknown>;
  inputs_hash: string;
  generation_started_at: string;
  generation_completed_at: string | null;
  generation_duration_ms: number | null;
  created_at: string;
}

/** Configuration for a single LoRA adapter. */
export interface LoraConfig {
  asset_id: number | null;
  version: string;
  hash: string;
  weight: number;
}

/* --------------------------------------------------------------------------
   Report types
   -------------------------------------------------------------------------- */

/** A segment whose model version no longer matches the current asset version. */
export interface StalenessReportEntry {
  segment_id: number;
  scene_id: number;
  receipt_id: number;
  model_version: string;
  current_model_version: string | null;
}

/** Reverse provenance: which segments used a given asset. */
export interface AssetUsageEntry {
  segment_id: number;
  scene_id: number;
  model_version: string;
  created_at: string;
}

/* --------------------------------------------------------------------------
   Request types
   -------------------------------------------------------------------------- */

/** Request body for creating a generation receipt. */
export interface CreateReceiptRequest {
  segment_id: number;
  source_image_hash: string;
  variant_image_hash: string;
  workflow_version: string;
  workflow_hash: string;
  model_asset_id?: number | null;
  model_version: string;
  model_hash: string;
  lora_configs: LoraConfig[];
  prompt_text: string;
  negative_prompt?: string | null;
  cfg_scale: number;
  seed: number;
  resolution_width: number;
  resolution_height: number;
  steps: number;
  sampler: string;
  additional_params?: Record<string, unknown>;
  inputs_hash: string;
  generation_started_at: string;
}

/** Request body for completing a generation receipt. */
export interface CompleteReceiptRequest {
  completed_at: string;
  duration_ms: number;
}
