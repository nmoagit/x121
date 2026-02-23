/**
 * Model & LoRA download manager types (PRD-104).
 */

import type { BadgeVariant } from "@/components/primitives";

// ---------------------------------------------------------------------------
// Download status
// ---------------------------------------------------------------------------

/** Download status ID matching download_statuses seed data. */
export type DownloadStatusId = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

/** Named constants for download status IDs. */
export const DOWNLOAD_STATUS = {
  QUEUED: 1,
  DOWNLOADING: 2,
  PAUSED: 3,
  VERIFYING: 4,
  REGISTERING: 5,
  COMPLETED: 6,
  FAILED: 7,
  CANCELLED: 8,
} as const;

/** Human-readable labels for each download status. */
export const STATUS_LABELS: Record<DownloadStatusId, string> = {
  [DOWNLOAD_STATUS.QUEUED]: "Queued",
  [DOWNLOAD_STATUS.DOWNLOADING]: "Downloading",
  [DOWNLOAD_STATUS.PAUSED]: "Paused",
  [DOWNLOAD_STATUS.VERIFYING]: "Verifying",
  [DOWNLOAD_STATUS.REGISTERING]: "Registering",
  [DOWNLOAD_STATUS.COMPLETED]: "Completed",
  [DOWNLOAD_STATUS.FAILED]: "Failed",
  [DOWNLOAD_STATUS.CANCELLED]: "Cancelled",
};

/** Badge variant for each download status. */
export const STATUS_VARIANTS: Record<DownloadStatusId, BadgeVariant> = {
  [DOWNLOAD_STATUS.QUEUED]: "default",
  [DOWNLOAD_STATUS.DOWNLOADING]: "info",
  [DOWNLOAD_STATUS.PAUSED]: "warning",
  [DOWNLOAD_STATUS.VERIFYING]: "info",
  [DOWNLOAD_STATUS.REGISTERING]: "info",
  [DOWNLOAD_STATUS.COMPLETED]: "success",
  [DOWNLOAD_STATUS.FAILED]: "danger",
  [DOWNLOAD_STATUS.CANCELLED]: "default",
};

// ---------------------------------------------------------------------------
// Source type
// ---------------------------------------------------------------------------

/** Source type labels. */
export const SOURCE_LABELS: Record<string, string> = {
  civitai: "CivitAI",
  huggingface: "HuggingFace",
  direct: "Direct URL",
};

// ---------------------------------------------------------------------------
// Model type
// ---------------------------------------------------------------------------

/** Model type labels. */
export const MODEL_TYPE_LABELS: Record<string, string> = {
  checkpoint: "Checkpoint",
  lora: "LoRA",
  embedding: "Embedding",
  vae: "VAE",
  controlnet: "ControlNet",
};

// ---------------------------------------------------------------------------
// Entity types
// ---------------------------------------------------------------------------

/** A model download row from the API. */
export interface ModelDownload {
  id: number;
  status_id: DownloadStatusId;
  source_type: string;
  source_url: string;
  source_model_id: string | null;
  source_version_id: string | null;
  model_name: string;
  model_type: string;
  base_model: string | null;
  file_name: string;
  file_size_bytes: number | null;
  downloaded_bytes: number;
  download_speed_bps: number | null;
  target_path: string | null;
  expected_hash: string | null;
  actual_hash: string | null;
  hash_verified: boolean;
  hash_mismatch: boolean;
  source_metadata: Record<string, unknown>;
  asset_id: number | null;
  error_message: string | null;
  retry_count: number;
  initiated_by: number | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

/** DTO for creating a new download. */
export interface CreateDownloadRequest {
  url: string;
  model_name?: string;
  model_type?: string;
}

/** Response after enqueuing a download. */
export interface DownloadCreatedResponse {
  download_id: number;
  status: string;
}

/** API token info (safe, no encrypted data). */
export interface ApiTokenInfo {
  service_name: string;
  token_hint: string;
  is_valid: boolean;
  last_used_at: string | null;
}

/** DTO for storing an API token. */
export interface StoreTokenRequest {
  service_name: string;
  token: string;
}

/** A placement rule row from the API. */
export interface PlacementRule {
  id: number;
  model_type: string;
  base_model: string | null;
  target_directory: string;
  priority: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/** DTO for creating a placement rule. */
export interface CreatePlacementRule {
  model_type: string;
  base_model?: string;
  target_directory: string;
  priority?: number;
  is_active?: boolean;
}

/** DTO for updating a placement rule. */
export interface UpdatePlacementRule {
  model_type?: string;
  base_model?: string;
  target_directory?: string;
  priority?: number;
  is_active?: boolean;
}
