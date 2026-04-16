export type AvatarReviewStatus =
  | "unassigned"
  | "assigned"
  | "in_review"
  | "approved"
  | "rejected"
  | "rework"
  | "re_queued";

export interface AvatarReviewAssignment {
  id: number;
  avatar_id: number;
  reviewer_user_id: number;
  assigned_by: number;
  reassigned_from: number | null;
  review_round: number;
  status: "active" | "completed" | "reassigned";
  started_at: string | null;
  completed_at: string | null;
  deadline: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReviewQueueAvatar {
  assignment_id: number;
  avatar_id: number;
  avatar_name: string;
  project_id: number;
  project_name: string;
  review_round: number;
  scene_count: number;
  assigned_at: string;
  deadline: string | null;
  status: string;
}

export interface ReviewerWorkload {
  reviewer_user_id: number;
  reviewer_username: string;
  assigned_count: number;
  in_review_count: number;
  completed_count: number;
  approved_count: number;
  rejected_count: number;
}

export interface AvatarReviewDecision {
  id: number;
  assignment_id: number;
  avatar_id: number;
  reviewer_user_id: number;
  decision: "approved" | "rejected";
  comment: string | null;
  review_round: number;
  review_duration_sec: number | null;
  decided_at: string;
}

export interface ReviewAuditEntry {
  id: number;
  avatar_id: number;
  action: string;
  actor_user_id: number;
  target_user_id: number | null;
  comment: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface AutoAllocatePreview {
  proposed_assignments: ProposedAssignment[];
  unassigned_count: number;
  reviewer_count: number;
}

export interface ProposedAssignment {
  avatar_id: number;
  avatar_name: string;
  reviewer_user_id: number;
  reviewer_username: string;
}

export interface CreateAssignmentRequest {
  avatar_ids: number[];
  reviewer_user_id: number;
  deadline?: string;
}

export interface ReviewDecisionRequest {
  decision: "approved" | "rejected";
  comment?: string;
}

export interface AutoAllocateRequest {
  exclude_reviewer_ids?: number[];
}

export interface AuditLogFilters {
  reviewer_user_id?: number;
  action?: string;
  from_date?: string;
  to_date?: string;
}

/* ------------------------------------------------------------------ */
/*  Shared constants                                                    */
/* ------------------------------------------------------------------ */

import {
  CheckCircle,
  XCircle,
  UserPlus,
  Play,
  RefreshCw,
  ArrowRightLeft,
} from "@/tokens/icons";

export const REVIEW_STATUS_MAP: Record<number, AvatarReviewStatus> = {
  1: "unassigned",
  2: "assigned",
  3: "in_review",
  4: "approved",
  5: "rejected",
  6: "rework",
  7: "re_queued",
};

export const REVIEW_ACTION_CONFIG: Record<
  string,
  { icon: typeof CheckCircle; label: string; color: string }
> = {
  assigned: { icon: UserPlus, label: "Assigned", color: "text-blue-400" },
  reassigned: { icon: ArrowRightLeft, label: "Reassigned", color: "text-yellow-400" },
  review_started: { icon: Play, label: "Review Started", color: "text-yellow-400" },
  approved: { icon: CheckCircle, label: "Approved", color: "text-[var(--color-data-green)]" },
  rejected: { icon: XCircle, label: "Rejected", color: "text-[var(--color-data-red)]" },
  rework_submitted: { icon: RefreshCw, label: "Submitted for Re-review", color: "text-blue-400" },
  re_queued: { icon: RefreshCw, label: "Re-queued", color: "text-blue-400" },
};
