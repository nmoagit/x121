/**
 * TypeScript types for job dependency chains & triggered workflows (PRD-97).
 *
 * These types mirror the backend API response shapes for triggers,
 * trigger logs, dry-run results, and chain graph nodes.
 */

import type { BadgeVariant } from "@/components/primitives";

/* --------------------------------------------------------------------------
   Enums / unions
   -------------------------------------------------------------------------- */

export type EventType = "completed" | "approved" | "failed";
export type EntityType = "variant" | "scene" | "segment" | "production_run";
export type ExecutionMode = "sequential" | "parallel";
export type TriggerResult = "success" | "failed" | "blocked" | "dry_run";

/* --------------------------------------------------------------------------
   Trigger action
   -------------------------------------------------------------------------- */

export interface TriggerAction {
  action: string;
  params: Record<string, unknown>;
}

/* --------------------------------------------------------------------------
   Trigger
   -------------------------------------------------------------------------- */

export interface Trigger {
  id: number;
  project_id: number;
  name: string;
  description: string | null;
  event_type: string;
  entity_type: string;
  scope: Record<string, unknown> | null;
  conditions: Record<string, unknown> | null;
  actions: TriggerAction[];
  execution_mode: string;
  max_chain_depth: number;
  requires_approval: boolean;
  is_enabled: boolean;
  sort_order: number;
  created_by_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface TriggerWithStats extends Trigger {
  fire_count: number;
  last_fired_at: string | null;
}

/* --------------------------------------------------------------------------
   Trigger log
   -------------------------------------------------------------------------- */

export interface TriggerLog {
  id: number;
  trigger_id: number;
  event_data: Record<string, unknown>;
  actions_taken: TriggerAction[];
  chain_depth: number;
  result: TriggerResult;
  error_message: string | null;
  created_at: string;
}

/* --------------------------------------------------------------------------
   Dry-run result
   -------------------------------------------------------------------------- */

export interface DryRunResult {
  trigger_id: number;
  trigger_name: string;
  actions: TriggerAction[];
  would_chain: boolean;
  chain_depth: number;
}

/* --------------------------------------------------------------------------
   Chain graph
   -------------------------------------------------------------------------- */

/** Raw chain graph node as returned by backend. */
export interface ChainGraphNodeRaw {
  trigger_id: number;
  name: string;
  event_type: string;
  entity_type: string;
  actions: TriggerAction[];
  is_enabled: boolean;
}

/** Chain graph node with computed downstream edges (client-side). */
export interface ChainGraphNode extends ChainGraphNodeRaw {
  downstream_triggers: number[];
}

/* --------------------------------------------------------------------------
   Mutation inputs
   -------------------------------------------------------------------------- */

export interface CreateTrigger {
  project_id: number;
  name: string;
  description?: string;
  event_type: string;
  entity_type: string;
  scope?: Record<string, unknown>;
  conditions?: Record<string, unknown>;
  actions: TriggerAction[];
  execution_mode?: ExecutionMode;
  max_chain_depth?: number;
  requires_approval?: boolean;
  is_enabled?: boolean;
  sort_order?: number;
}

export type UpdateTrigger = Partial<CreateTrigger>;

/* --------------------------------------------------------------------------
   Display constants
   -------------------------------------------------------------------------- */

export const EVENT_TYPE_LABEL: Record<EventType, string> = {
  completed: "Completed",
  approved: "Approved",
  failed: "Failed",
};

export const ENTITY_TYPE_LABEL: Record<EntityType, string> = {
  variant: "Variant",
  scene: "Scene",
  segment: "Segment",
  production_run: "Production Run",
};

export const EXECUTION_MODE_LABEL: Record<ExecutionMode, string> = {
  sequential: "Sequential",
  parallel: "Parallel",
};

export const TRIGGER_RESULT_BADGE: Record<TriggerResult, BadgeVariant> = {
  success: "success",
  failed: "danger",
  blocked: "warning",
  dry_run: "info",
};
