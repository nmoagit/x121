/**
 * TypeScript types for the segment review workflow (PRD-35).
 *
 * These types mirror the backend API response shapes.
 */

/* --------------------------------------------------------------------------
   Segment approval
   -------------------------------------------------------------------------- */

export interface SegmentApproval {
  id: number;
  segment_id: number;
  user_id: number;
  decision: "approved" | "rejected" | "flagged";
  reason_category_id: number | null;
  comment: string | null;
  segment_version: number;
  decided_at: string;
  created_at: string;
  updated_at: string;
}

/* --------------------------------------------------------------------------
   Rejection categories
   -------------------------------------------------------------------------- */

export interface RejectionCategory {
  id: number;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

/* --------------------------------------------------------------------------
   Review queue
   -------------------------------------------------------------------------- */

export interface ReviewQueueItem {
  segment_id: number;
  scene_id: number;
  sequence_index: number;
  status_id: number;
  has_approval: boolean;
}

/* --------------------------------------------------------------------------
   Request bodies
   -------------------------------------------------------------------------- */

export interface ApproveInput {
  segment_version: number;
}

export interface RejectInput {
  reason_category_id?: number;
  comment?: string;
  segment_version: number;
}

export interface FlagInput {
  comment?: string;
  segment_version: number;
}

/* --------------------------------------------------------------------------
   Decision constants (match backend)
   -------------------------------------------------------------------------- */

export const DECISION_APPROVED = "approved" as const;
export const DECISION_REJECTED = "rejected" as const;
export const DECISION_FLAGGED = "flagged" as const;

/** Default auto-advance delay in milliseconds. */
export const AUTO_ADVANCE_DELAY_MS = 500;

/** Map a decision to a human-readable label. */
export function decisionLabel(decision: string): string {
  switch (decision) {
    case DECISION_APPROVED:
      return "Approved";
    case DECISION_REJECTED:
      return "Rejected";
    case DECISION_FLAGGED:
      return "Flagged";
    default:
      return decision;
  }
}

/** Map a decision to a Tailwind-compatible color token. */
export function decisionColor(decision: string): string {
  switch (decision) {
    case DECISION_APPROVED:
      return "var(--color-status-success)";
    case DECISION_REJECTED:
      return "var(--color-status-error)";
    case DECISION_FLAGGED:
      return "var(--color-status-warning)";
    default:
      return "var(--color-text-muted)";
  }
}
