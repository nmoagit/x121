/**
 * TypeScript types for Workflow Regression Testing (PRD-65).
 *
 * These types mirror the backend API response shapes for regression
 * references, runs, results, and report summaries.
 */

import type { BadgeVariant } from "@/components/primitives";

/* --------------------------------------------------------------------------
   Verdict constants
   -------------------------------------------------------------------------- */

export const VERDICT_IMPROVED = "improved" as const;
export const VERDICT_SAME = "same" as const;
export const VERDICT_DEGRADED = "degraded" as const;
export const VERDICT_ERROR = "error" as const;

export type Verdict =
  | typeof VERDICT_IMPROVED
  | typeof VERDICT_SAME
  | typeof VERDICT_DEGRADED
  | typeof VERDICT_ERROR;

/* --------------------------------------------------------------------------
   Trigger type constants
   -------------------------------------------------------------------------- */

export const TRIGGER_WORKFLOW_UPDATE = "workflow_update" as const;
export const TRIGGER_LORA_UPDATE = "lora_update" as const;
export const TRIGGER_MODEL_UPDATE = "model_update" as const;
export const TRIGGER_MANUAL = "manual" as const;

export type TriggerType =
  | typeof TRIGGER_WORKFLOW_UPDATE
  | typeof TRIGGER_LORA_UPDATE
  | typeof TRIGGER_MODEL_UPDATE
  | typeof TRIGGER_MANUAL;

/* --------------------------------------------------------------------------
   Run status
   -------------------------------------------------------------------------- */

export type RunStatus = "pending" | "running" | "completed" | "failed" | "cancelled";

/* --------------------------------------------------------------------------
   Entities
   -------------------------------------------------------------------------- */

export interface RegressionReference {
  id: number;
  character_id: number;
  scene_type_id: number;
  reference_scene_id: number;
  baseline_scores: Record<string, number>;
  notes: string | null;
  created_by: number;
  created_at: string;
  updated_at: string;
}

export interface RegressionRun {
  id: number;
  trigger_type: TriggerType;
  trigger_description: string | null;
  status: RunStatus;
  total_references: number;
  completed_count: number;
  passed_count: number;
  failed_count: number;
  started_at: string | null;
  completed_at: string | null;
  triggered_by: number;
  created_at: string;
  updated_at: string;
}

export interface RegressionResult {
  id: number;
  run_id: number;
  reference_id: number;
  new_scene_id: number | null;
  baseline_scores: Record<string, number>;
  new_scores: Record<string, number>;
  score_diffs: Record<string, number>;
  verdict: Verdict;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface RunReportSummary {
  total: number;
  improved: number;
  same: number;
  degraded: number;
  errors: number;
  overall_passed: boolean;
}

export interface RunReport {
  run: RegressionRun;
  results: RegressionResult[];
  summary: RunReportSummary;
}

/* --------------------------------------------------------------------------
   DTOs
   -------------------------------------------------------------------------- */

export interface CreateRegressionReference {
  character_id: number;
  scene_type_id: number;
  reference_scene_id: number;
  baseline_scores: Record<string, number>;
  notes?: string;
}

export interface TriggerRegressionRun {
  trigger_type: TriggerType;
  trigger_description?: string;
}

/* --------------------------------------------------------------------------
   Run status styling
   -------------------------------------------------------------------------- */

export const RUN_STATUS_BADGE_VARIANT: Record<RunStatus, BadgeVariant> = {
  pending: "default",
  running: "info",
  completed: "success",
  failed: "danger",
  cancelled: "warning",
};

export const RUN_STATUS_LABELS: Record<RunStatus, string> = {
  pending: "Pending",
  running: "Running",
  completed: "Completed",
  failed: "Failed",
  cancelled: "Cancelled",
};

/* --------------------------------------------------------------------------
   Verdict styling
   -------------------------------------------------------------------------- */

export const VERDICT_LABELS: Record<Verdict, string> = {
  improved: "Improved",
  same: "No Change",
  degraded: "Degraded",
  error: "Error",
};

export const VERDICT_BADGE_VARIANTS: Record<Verdict, BadgeVariant> = {
  improved: "success",
  same: "default",
  degraded: "danger",
  error: "warning",
};
