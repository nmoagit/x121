/**
 * ComfyUI Workflow Import & Validation types (PRD-75).
 */

import type { BadgeVariant } from "@/components";

/* --------------------------------------------------------------------------
   Entity types
   -------------------------------------------------------------------------- */

/** A workflow record from the server. */
export interface Workflow {
  id: number;
  name: string;
  description: string | null;
  current_version: number;
  status_id: number;
  json_content: Record<string, unknown>;
  discovered_params_json: DiscoveredParameter[] | null;
  validation_results_json: ValidationResult | null;
  imported_from: string | null;
  imported_by: number | null;
  created_at: string;
  updated_at: string;
}

/** A workflow version record. */
export interface WorkflowVersion {
  id: number;
  workflow_id: number;
  version: number;
  json_content: Record<string, unknown>;
  discovered_params_json: DiscoveredParameter[] | null;
  change_summary: string | null;
  created_by: number | null;
  created_at: string;
}

/* --------------------------------------------------------------------------
   Request types
   -------------------------------------------------------------------------- */

/** Request body for importing a new workflow. */
export interface ImportWorkflowRequest {
  name: string;
  description?: string | null;
  json_content: Record<string, unknown>;
}

/* --------------------------------------------------------------------------
   Workflow node types
   -------------------------------------------------------------------------- */

/** A node in a parsed ComfyUI workflow. */
export interface WorkflowNode {
  id: string;
  class_type: string;
  inputs: Record<string, unknown>;
}

/* --------------------------------------------------------------------------
   Parameter types
   -------------------------------------------------------------------------- */

/** Type of a discovered parameter. */
export type ParamType =
  | "seed"
  | "cfg"
  | "denoise"
  | "prompt"
  | "negative_prompt"
  | "image"
  | "steps"
  | "sampler"
  | { other: string };

/** A parameter discovered by heuristic analysis. */
export interface DiscoveredParameter {
  node_id: string;
  input_name: string;
  param_type: ParamType;
  current_value: unknown;
  suggested_name: string;
  category: string;
}

/* --------------------------------------------------------------------------
   Validation types
   -------------------------------------------------------------------------- */

/** Result of validating a single node type. */
export interface NodeValidationResult {
  node_type: string;
  present: boolean;
}

/** Result of validating a single model. */
export interface ModelValidationResult {
  model_name: string;
  found_in_registry: boolean;
}

/** Aggregate validation result for a workflow. */
export interface ValidationResult {
  node_results: NodeValidationResult[];
  model_results: ModelValidationResult[];
  overall_valid: boolean;
}

/* --------------------------------------------------------------------------
   Diff response
   -------------------------------------------------------------------------- */

/** Response from the version diff endpoint. */
export interface VersionDiffResponse {
  workflow_id: number;
  version_a: number;
  version_b: number;
  change_summary_a: string | null;
  change_summary_b: string | null;
  keys_changed: string[];
}

/* --------------------------------------------------------------------------
   Status helpers
   -------------------------------------------------------------------------- */

/** Workflow status ID constants.
 *  Sync: mirrors `WORKFLOW_STATUS_ID_*` in `core/src/workflow_import.rs`. */
export const WORKFLOW_STATUS = {
  DRAFT: 1,
  VALIDATED: 2,
  TESTED: 3,
  PRODUCTION: 4,
  DEPRECATED: 5,
} as const;

/** Human-readable labels for workflow statuses. */
const STATUS_LABELS: Record<number, string> = {
  [WORKFLOW_STATUS.DRAFT]: "Draft",
  [WORKFLOW_STATUS.VALIDATED]: "Validated",
  [WORKFLOW_STATUS.TESTED]: "Tested",
  [WORKFLOW_STATUS.PRODUCTION]: "Production",
  [WORKFLOW_STATUS.DEPRECATED]: "Deprecated",
};

/** Map a workflow status ID to a human-readable label. */
export function workflowStatusLabel(statusId: number): string {
  return STATUS_LABELS[statusId] ?? "Unknown";
}

/** Map a workflow status ID to a Badge variant. */
export function workflowStatusVariant(statusId: number): BadgeVariant {
  switch (statusId) {
    case WORKFLOW_STATUS.DRAFT:
      return "default";
    case WORKFLOW_STATUS.VALIDATED:
      return "info";
    case WORKFLOW_STATUS.TESTED:
      return "success";
    case WORKFLOW_STATUS.PRODUCTION:
      return "success";
    case WORKFLOW_STATUS.DEPRECATED:
      return "warning";
    default:
      return "default";
  }
}
