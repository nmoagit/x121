export type CharacterReviewStatus =
  | "unassigned"
  | "assigned"
  | "in_review"
  | "approved"
  | "rejected"
  | "rework"
  | "re_queued";

export interface CharacterReviewAssignment {
  id: number;
  character_id: number;
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

export interface ReviewQueueCharacter {
  assignment_id: number;
  character_id: number;
  character_name: string;
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

export interface CharacterReviewDecision {
  id: number;
  assignment_id: number;
  character_id: number;
  reviewer_user_id: number;
  decision: "approved" | "rejected";
  comment: string | null;
  review_round: number;
  review_duration_sec: number | null;
  decided_at: string;
}

export interface ReviewAuditEntry {
  id: number;
  character_id: number;
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
  character_id: number;
  character_name: string;
  reviewer_user_id: number;
  reviewer_username: string;
}

export interface CreateAssignmentRequest {
  character_ids: number[];
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
