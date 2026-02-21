/**
 * Onboarding feature types (PRD-53).
 */

import type { Placement } from "@/components";

/** Server-side onboarding state for a user. */
export interface UserOnboarding {
  id: number;
  user_id: number;
  tour_completed: boolean;
  hints_dismissed_json: string[];
  checklist_progress_json: Record<string, boolean>;
  feature_reveal_json: Record<string, boolean>;
  sample_project_id: number | null;
  created_at: string;
  updated_at: string;
}

/** Partial update payload for onboarding state. */
export interface UpdateOnboarding {
  tour_completed?: boolean;
  hints_dismissed_json?: string[];
  checklist_progress_json?: Record<string, boolean>;
  feature_reveal_json?: Record<string, boolean>;
}

/** A single step in the guided tour. */
export interface TourStep {
  target: string;
  title: string;
  description: string;
  placement: Placement;
}

/** A contextual hint definition with its message and placement. */
export interface HintDefinition {
  message: string;
  placement: Placement;
}

/** A checklist item with its completion status. */
export interface ChecklistItem {
  id: string;
  label: string;
  completed: boolean;
}

/* --------------------------------------------------------------------------
   Shared styling constants
   -------------------------------------------------------------------------- */

/** Tailwind classes for dismiss/skip text buttons used across onboarding components. */
export const DISMISS_LINK_CLASSES =
  "text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors";

/* --------------------------------------------------------------------------
   Constants (mirror backend core/onboarding.rs)
   -------------------------------------------------------------------------- */

/** Known checklist item IDs. */
export const CHECKLIST_ITEM_IDS = [
  "upload_portrait",
  "run_generation",
  "approve_segment",
  "configure_workflow",
  "invite_team",
] as const;

/** Human-readable labels for each checklist item. */
export const CHECKLIST_LABELS: Record<string, string> = {
  upload_portrait: "Upload a character portrait",
  run_generation: "Run your first generation",
  approve_segment: "Approve a segment",
  configure_workflow: "Configure a workflow",
  invite_team: "Invite a team member",
};

/** Known feature reveal keys. */
export const FEATURE_KEYS = [
  "advanced_workflow",
  "branching",
  "worker_pool",
  "custom_themes",
] as const;
