/**
 * Pipeline Stage Hooks types (PRD-77).
 */

import type { BadgeVariant } from "@/components";

/* --------------------------------------------------------------------------
   Enum types
   -------------------------------------------------------------------------- */

/** The execution mechanism for a hook. */
export type HookType = "shell" | "python" | "webhook";

/** The pipeline stage at which a hook fires. */
export type HookPoint =
  | "post_variant"
  | "pre_segment"
  | "post_segment"
  | "pre_concatenation"
  | "post_delivery";

/** The organisational level at which a hook is defined. */
export type ScopeType = "studio" | "project" | "scene_type";

/** What happens when a hook execution fails. */
export type FailureMode = "block" | "warn" | "ignore";

/* --------------------------------------------------------------------------
   Entity types
   -------------------------------------------------------------------------- */

/** A hook row from the server. */
export interface Hook {
  id: number;
  name: string;
  description: string | null;
  hook_type: HookType;
  hook_point: HookPoint;
  scope_type: ScopeType;
  scope_id: number | null;
  failure_mode: FailureMode;
  config_json: Record<string, unknown>;
  sort_order: number;
  enabled: boolean;
  created_by: number | null;
  created_at: string;
  updated_at: string;
}

/** A hook execution log entry from the server. */
export interface HookExecutionLog {
  id: number;
  hook_id: number;
  job_id: number | null;
  input_json: Record<string, unknown> | null;
  output_text: string | null;
  exit_code: number | null;
  duration_ms: number | null;
  success: boolean;
  error_message: string | null;
  executed_at: string;
}

/** A resolved hook after applying scope-based inheritance. */
export interface EffectiveHook {
  hook_id: number;
  name: string;
  hook_type: HookType;
  hook_point: HookPoint;
  scope_type: ScopeType;
  failure_mode: FailureMode;
  config_json: Record<string, unknown>;
  sort_order: number;
  source_level: string;
}

/* --------------------------------------------------------------------------
   Request types
   -------------------------------------------------------------------------- */

/** Request body for creating a new hook. */
export interface CreateHookRequest {
  name: string;
  description?: string | null;
  hook_type: HookType;
  hook_point: HookPoint;
  scope_type: ScopeType;
  scope_id?: number | null;
  failure_mode?: FailureMode;
  config_json: Record<string, unknown>;
  sort_order?: number;
  enabled?: boolean;
}

/** Request body for updating an existing hook. */
export interface UpdateHookRequest {
  name?: string;
  description?: string | null;
  hook_type?: HookType;
  failure_mode?: FailureMode;
  config_json?: Record<string, unknown>;
  sort_order?: number;
  enabled?: boolean;
}

/* --------------------------------------------------------------------------
   Labels & helpers
   -------------------------------------------------------------------------- */

/** Human-readable labels for hook points. */
export const HOOK_POINT_LABELS: Record<HookPoint, string> = {
  post_variant: "Post Variant",
  pre_segment: "Pre Segment",
  post_segment: "Post Segment",
  pre_concatenation: "Pre Concatenation",
  post_delivery: "Post Delivery",
};

/** Human-readable labels for failure modes. */
export const FAILURE_MODE_LABELS: Record<FailureMode, string> = {
  block: "Block Pipeline",
  warn: "Warn & Continue",
  ignore: "Ignore Failures",
};

/** Map a failure mode to its corresponding Badge variant. */
export function failureModeVariant(mode: FailureMode): BadgeVariant {
  switch (mode) {
    case "block":
      return "danger";
    case "warn":
      return "warning";
    case "ignore":
      return "default";
  }
}

/** Map a hook type to its corresponding Badge variant. */
export function hookTypeVariant(type: HookType): BadgeVariant {
  switch (type) {
    case "shell":
      return "info";
    case "python":
      return "success";
    case "webhook":
      return "warning";
  }
}
