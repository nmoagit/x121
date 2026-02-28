/**
 * TypeScript types for project lifecycle & archival (PRD-72).
 *
 * Defines lifecycle states, valid transitions, and all API
 * request/response shapes for the lifecycle subsystem.
 */

import type { BadgeVariant } from "@/components/primitives";

/* --------------------------------------------------------------------------
   Lifecycle state enum & labels
   -------------------------------------------------------------------------- */

export type LifecycleState = "setup" | "active" | "delivered" | "archived" | "closed";

export const LIFECYCLE_STATE_LABELS: Record<LifecycleState, string> = {
  setup: "Setup",
  active: "Active",
  delivered: "Delivered",
  archived: "Archived",
  closed: "Closed",
};

export const LIFECYCLE_STATE_BADGE_VARIANT: Record<LifecycleState, BadgeVariant> = {
  setup: "info",
  active: "success",
  delivered: "info",
  archived: "default",
  closed: "default",
};

/* --------------------------------------------------------------------------
   Transition rules
   -------------------------------------------------------------------------- */

/** Valid next states reachable from each lifecycle state. */
export const VALID_TRANSITIONS: Record<LifecycleState, LifecycleState[]> = {
  setup: ["active"],
  active: ["delivered"],
  delivered: ["active", "archived"],
  archived: ["active", "closed"],
  closed: [],
};

/** States where project content is edit-locked. */
export const LOCKED_STATES: LifecycleState[] = ["delivered", "archived", "closed"];

/** Check whether a state prevents project editing. */
export function isEditLocked(state: LifecycleState): boolean {
  return LOCKED_STATES.includes(state);
}

/** Human-readable action labels for each transition target. */
export const TRANSITION_LABELS: Record<LifecycleState, string> = {
  setup: "Set Up",
  active: "Activate",
  delivered: "Mark Delivered",
  archived: "Archive",
  closed: "Close",
};

/** Transitions that require a confirmation dialog. */
export const CONFIRM_TRANSITIONS: LifecycleState[] = ["archived", "closed"];

/* --------------------------------------------------------------------------
   Checklist
   -------------------------------------------------------------------------- */

export interface ChecklistItem {
  name: string;
  description: string;
  passed: boolean;
  blocking: boolean;
  details: string | null;
}

export interface ChecklistResult {
  passed: boolean;
  items: ChecklistItem[];
}

/* --------------------------------------------------------------------------
   Project summary report
   -------------------------------------------------------------------------- */

export interface ProjectSummaryData {
  total_characters: number;
  total_scenes: number;
  total_segments: number;
  approved_scenes: number;
  qa_pass_rate: number;
  regeneration_count: number;
  wall_clock_days: number;
}

export interface ProjectSummary {
  id: number;
  project_id: number;
  report_json: ProjectSummaryData;
  generated_at: string;
  generated_by: number | null;
  created_at: string;
  updated_at: string;
}

/* --------------------------------------------------------------------------
   API request/response shapes
   -------------------------------------------------------------------------- */

export interface TransitionRequest {
  admin_override?: boolean;
}

export interface TransitionResponse {
  project_id: number;
  previous_state: string;
  new_state: string;
  is_edit_locked: boolean;
  checklist: ChecklistResult | null;
  summary_generated: boolean;
}

export interface BulkArchiveRequest {
  project_ids: number[];
}

export interface BulkArchiveResponse {
  archived_count: number;
  failed_ids: number[];
}
