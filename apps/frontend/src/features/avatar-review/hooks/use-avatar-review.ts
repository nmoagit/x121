import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { downloadBlob } from "@/lib/file-utils";
import type {
  AvatarReviewAssignment,
  ReviewQueueAvatar,
  ReviewerWorkload,
  ReviewAuditEntry,
  AutoAllocatePreview,
  CreateAssignmentRequest,
  ReviewDecisionRequest,
  AutoAllocateRequest,
  AuditLogFilters,
} from "../types";

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */

function buildAuditFilterParams(filters?: AuditLogFilters): string {
  const params = new URLSearchParams();
  if (filters?.reviewer_user_id) params.set("reviewer_user_id", String(filters.reviewer_user_id));
  if (filters?.action) params.set("action", filters.action);
  if (filters?.from_date) params.set("from_date", filters.from_date);
  if (filters?.to_date) params.set("to_date", filters.to_date);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

function invalidateReviewQueries(qc: ReturnType<typeof useQueryClient>, projectId: number) {
  qc.invalidateQueries({ queryKey: KEYS.assignments(projectId) });
  qc.invalidateQueries({ queryKey: KEYS.workload(projectId) });
  qc.invalidateQueries({ queryKey: KEYS.myQueue });
}

const KEYS = {
  myQueue: ["avatar-review", "my-queue"] as const,
  assignments: (projectId: number) =>
    ["avatar-review", "assignments", projectId] as const,
  workload: (projectId: number) =>
    ["avatar-review", "workload", projectId] as const,
  reviewHistory: (avatarId: number) =>
    ["avatar-review", "history", avatarId] as const,
  auditLog: (projectId: number, filters?: AuditLogFilters) =>
    ["avatar-review", "audit-log", projectId, filters] as const,
};

/* ------------------------------------------------------------------ */
/*  Queries                                                            */
/* ------------------------------------------------------------------ */

export function useMyReviewQueue() {
  return useQuery({
    queryKey: KEYS.myQueue,
    queryFn: () =>
      api.get<ReviewQueueAvatar[]>(
        "/review/avatar-assignments/my-queue",
      ),
  });
}

export function useProjectAssignments(projectId: number) {
  return useQuery({
    queryKey: KEYS.assignments(projectId),
    queryFn: () =>
      api.get<AvatarReviewAssignment[]>(
        `/projects/${projectId}/review/assignments`,
      ),
  });
}

export function useReviewerWorkload(projectId: number) {
  return useQuery({
    queryKey: KEYS.workload(projectId),
    queryFn: () =>
      api.get<ReviewerWorkload[]>(
        `/projects/${projectId}/review/workload`,
      ),
  });
}

export function useAvatarReviewHistory(avatarId: number) {
  return useQuery({
    queryKey: KEYS.reviewHistory(avatarId),
    queryFn: () =>
      api.get<ReviewAuditEntry[]>(
        `/avatars/${avatarId}/review-history`,
      ),
  });
}

export function useProjectAuditLog(
  projectId: number,
  filters?: AuditLogFilters,
) {
  return useQuery({
    queryKey: KEYS.auditLog(projectId, filters),
    queryFn: () =>
      api.get<ReviewAuditEntry[]>(
        `/projects/${projectId}/review/audit-log${buildAuditFilterParams(filters)}`,
      ),
  });
}

/* ------------------------------------------------------------------ */
/*  Mutations                                                          */
/* ------------------------------------------------------------------ */

export function useAssignAvatars(projectId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: CreateAssignmentRequest) =>
      api.post(`/projects/${projectId}/review/assignments`, req),
    onSuccess: () => invalidateReviewQueries(qc, projectId),
  });
}

export function useAutoAllocate(projectId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: {
      preview?: boolean;
      body?: AutoAllocateRequest;
    }) => {
      const qs = req.preview ? "?preview=true" : "";
      return api.post<AutoAllocatePreview>(
        `/projects/${projectId}/review/auto-allocate${qs}`,
        req.body ?? {},
      );
    },
    onSuccess: (_, vars) => {
      if (!vars.preview) {
        invalidateReviewQueries(qc, projectId);
      }
    },
  });
}

export function useReassign(projectId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: {
      assignmentId: number;
      new_reviewer_user_id: number;
    }) =>
      api.patch(
        `/projects/${projectId}/review/assignments/${req.assignmentId}`,
        { new_reviewer_user_id: req.new_reviewer_user_id },
      ),
    onSuccess: () => invalidateReviewQueries(qc, projectId),
  });
}

export function useStartReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (assignmentId: number) =>
      api.post(
        `/review/avatar-assignments/assignments/${assignmentId}/start`,
        {},
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.myQueue });
    },
  });
}

export function useSubmitDecision() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: { assignmentId: number } & ReviewDecisionRequest) =>
      api.post(
        `/review/avatar-assignments/assignments/${req.assignmentId}/decide`,
        { decision: req.decision, comment: req.comment },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.myQueue });
    },
  });
}

export function useSubmitForRereview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (avatarId: number) =>
      api.post(`/avatars/${avatarId}/submit-for-rereview`, {}),
    onSuccess: (_, avatarId) => {
      qc.invalidateQueries({ queryKey: KEYS.reviewHistory(avatarId) });
      qc.invalidateQueries({ queryKey: KEYS.myQueue });
    },
  });
}

export function useExportAuditLog(projectId: number) {
  return async (filters?: AuditLogFilters) => {
    const response = await api.raw(
      `/projects/${projectId}/review/audit-log/export${buildAuditFilterParams(filters)}`,
    );
    const blob = await response.blob();
    downloadBlob(blob, "review-audit-log.csv");
  };
}
