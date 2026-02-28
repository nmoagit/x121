/**
 * TypeScript types for Batch Review & Approval Workflows (PRD-92).
 *
 * These types mirror the backend API response shapes for batch review
 * operations, assignments, sessions, and progress tracking.
 */

import type { BadgeVariant } from "@/components/primitives/Badge";

/* --------------------------------------------------------------------------
   Enums & constants
   -------------------------------------------------------------------------- */

export type AssignmentStatus = "active" | "completed" | "overdue";
export type SortMode = "worst_qa_first" | "oldest_first" | "by_scene_type" | "by_character";

export const ASSIGNMENT_STATUS_LABELS: Record<AssignmentStatus, string> = {
  active: "Active",
  completed: "Completed",
  overdue: "Overdue",
};

/** Use `BadgeVariant` from the design system to avoid `as BadgeVariant` casts (DRY-533). */
export const ASSIGNMENT_STATUS_BADGE_VARIANT: Record<AssignmentStatus, BadgeVariant> = {
  active: "success",
  completed: "default",
  overdue: "danger",
};

export const SORT_MODE_LABELS: Record<SortMode, string> = {
  worst_qa_first: "Worst QA First",
  oldest_first: "Oldest First",
  by_scene_type: "By Scene Type",
  by_character: "By Character",
};

/* --------------------------------------------------------------------------
   Assignments
   -------------------------------------------------------------------------- */

export interface ReviewAssignment {
  id: number;
  project_id: number;
  reviewer_user_id: number;
  filter_criteria_json: Record<string, unknown>;
  deadline: string | null;
  status: AssignmentStatus;
  assigned_by: number;
  created_at: string;
  updated_at: string;
}

export interface CreateAssignmentInput {
  project_id: number;
  reviewer_user_id: number;
  filter_criteria_json?: Record<string, unknown>;
  deadline?: string;
}

export interface UpdateAssignmentInput {
  status?: AssignmentStatus;
  deadline?: string;
  filter_criteria_json?: Record<string, unknown>;
}

/* --------------------------------------------------------------------------
   Sessions
   -------------------------------------------------------------------------- */

export interface ReviewSession {
  id: number;
  user_id: number;
  started_at: string;
  ended_at: string | null;
  segments_reviewed: number;
  segments_approved: number;
  segments_rejected: number;
  avg_pace_seconds: number | null;
  created_at: string;
  updated_at: string;
}

/* --------------------------------------------------------------------------
   Batch action payloads
   -------------------------------------------------------------------------- */

export interface BatchApproveInput {
  segment_ids: number[];
}

export interface BatchRejectInput {
  segment_ids: number[];
  reason?: string;
}

export interface AutoApproveInput {
  project_id: number;
  threshold: number;
}

export interface BatchActionResponse {
  processed_count: number;
  segment_ids: number[];
}

/* --------------------------------------------------------------------------
   Progress
   -------------------------------------------------------------------------- */

export interface ReviewProgressResponse {
  total_segments: number;
  reviewed_segments: number;
  approved_segments: number;
  rejected_segments: number;
  pending_segments: number;
  avg_pace_seconds: number | null;
  estimated_remaining_seconds: number | null;
}

/* --------------------------------------------------------------------------
   Quick review keyboard shortcuts
   -------------------------------------------------------------------------- */

export const QUICK_REVIEW_KEYS = {
  approve: "1",
  reject: "2",
  flag: "3",
  skip: " ", // space
} as const;

/* --------------------------------------------------------------------------
   Formatters
   -------------------------------------------------------------------------- */

/** Format review pace as a human-readable string. */
export function formatPace(seconds: number | null): string {
  if (seconds == null) return "\u2014";
  if (seconds < 60) return `${Math.round(seconds)}s/segment`;
  return `${(seconds / 60).toFixed(1)}m/segment`;
}

/** Format estimated remaining time as a human-readable string. */
export function formatEstimatedTime(seconds: number | null): string {
  if (seconds == null) return "\u2014";
  if (seconds < 60) return `${Math.round(seconds)}s remaining`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m remaining`;
  return `${(seconds / 3600).toFixed(1)}h remaining`;
}
