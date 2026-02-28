/**
 * Smart auto-retry types (PRD-71).
 */

import type { BadgeVariant } from "@/components/primitives/Badge";

/* --------------------------------------------------------------------------
   Retry policy (per scene type)
   -------------------------------------------------------------------------- */

export interface RetryPolicy {
  enabled: boolean;
  max_attempts: number;
  trigger_checks: string[];
  seed_variation: boolean;
  cfg_jitter: number;
}

export interface UpdateRetryPolicy {
  enabled?: boolean;
  max_attempts?: number;
  trigger_checks?: string[];
  seed_variation?: boolean;
  cfg_jitter?: number;
}

/* --------------------------------------------------------------------------
   Retry attempts (per segment)
   -------------------------------------------------------------------------- */

export type RetryAttemptStatus =
  | "pending"
  | "generating"
  | "qa_running"
  | "passed"
  | "failed"
  | "selected";

export interface RetryAttempt {
  id: number;
  segment_id: number;
  attempt_number: number;
  seed: number;
  parameters: Record<string, unknown>;
  original_parameters: Record<string, unknown>;
  output_video_path: string | null;
  quality_scores: Record<string, number> | null;
  overall_status: RetryAttemptStatus;
  is_selected: boolean;
  gpu_seconds: number | null;
  failure_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateRetryAttempt {
  attempt_number: number;
  seed: number;
  parameters: Record<string, unknown>;
  original_parameters: Record<string, unknown>;
}

export interface UpdateRetryAttempt {
  output_video_path?: string;
  quality_scores?: Record<string, number>;
  overall_status?: RetryAttemptStatus;
  is_selected?: boolean;
  gpu_seconds?: number;
  failure_reason?: string;
}

/* --------------------------------------------------------------------------
   Badge variant mapping for attempt status
   -------------------------------------------------------------------------- */

export const ATTEMPT_STATUS_BADGE_VARIANT: Record<RetryAttemptStatus, BadgeVariant> = {
  pending: "default",
  generating: "info",
  qa_running: "warning",
  passed: "success",
  failed: "danger",
  selected: "success",
};

/* --------------------------------------------------------------------------
   QA trigger check options
   -------------------------------------------------------------------------- */

export const TRIGGER_CHECK_OPTIONS = [
  { value: "face_confidence", label: "Face Confidence" },
  { value: "motion_score", label: "Motion Score" },
  { value: "resolution", label: "Resolution" },
  { value: "frame_quality", label: "Frame Quality" },
] as const;

/* --------------------------------------------------------------------------
   Policy constraints
   Canonical source: core/src/auto_retry.rs (MIN_RETRY_ATTEMPTS, MAX_RETRY_ATTEMPTS)
   -------------------------------------------------------------------------- */

export const MIN_MAX_ATTEMPTS = 1;
export const MAX_MAX_ATTEMPTS = 10;
export const MIN_CFG_JITTER = 0;
export const MAX_CFG_JITTER = 2.0;
export const CFG_JITTER_STEP = 0.1;
