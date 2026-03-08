import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type {
  CharacterReviewAssignment,
  ReviewQueueCharacter,
  ReviewerWorkload,
  ReviewAuditEntry,
  AutoAllocatePreview,
  CreateAssignmentRequest,
  ReviewDecisionRequest,
  AutoAllocateRequest,
  AuditLogFilters,
} from "../types";

const KEYS = {
  myQueue: ["character-review", "my-queue"] as const,
  assignments: (projectId: number) =>
    ["character-review", "assignments", projectId] as const,
  workload: (projectId: number) =>
    ["character-review", "workload", projectId] as const,
  reviewHistory: (characterId: number) =>
    ["character-review", "history", characterId] as const,
  auditLog: (projectId: number, filters?: AuditLogFilters) =>
    ["character-review", "audit-log", projectId, filters] as const,
};

/* ------------------------------------------------------------------ */
/*  Queries                                                            */
/* ------------------------------------------------------------------ */

export function useMyReviewQueue() {
  return useQuery({
    queryKey: KEYS.myQueue,
    queryFn: () =>
      api.get<ReviewQueueCharacter[]>(
        "/review/character-assignments/my-queue",
      ),
  });
}

export function useProjectAssignments(projectId: number) {
  return useQuery({
    queryKey: KEYS.assignments(projectId),
    queryFn: () =>
      api.get<CharacterReviewAssignment[]>(
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

export function useCharacterReviewHistory(characterId: number) {
  return useQuery({
    queryKey: KEYS.reviewHistory(characterId),
    queryFn: () =>
      api.get<ReviewAuditEntry[]>(
        `/characters/${characterId}/review-history`,
      ),
  });
}

export function useProjectAuditLog(
  projectId: number,
  filters?: AuditLogFilters,
) {
  return useQuery({
    queryKey: KEYS.auditLog(projectId, filters),
    queryFn: () => {
      const params = new URLSearchParams();
      if (filters?.reviewer_user_id)
        params.set("reviewer_user_id", String(filters.reviewer_user_id));
      if (filters?.action) params.set("action", filters.action);
      if (filters?.from_date) params.set("from_date", filters.from_date);
      if (filters?.to_date) params.set("to_date", filters.to_date);
      const qs = params.toString();
      return api.get<ReviewAuditEntry[]>(
        `/projects/${projectId}/review/audit-log${qs ? `?${qs}` : ""}`,
      );
    },
  });
}

/* ------------------------------------------------------------------ */
/*  Mutations                                                          */
/* ------------------------------------------------------------------ */

export function useAssignCharacters(projectId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: CreateAssignmentRequest) =>
      api.post(`/projects/${projectId}/review/assignments`, req),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.assignments(projectId) });
      qc.invalidateQueries({ queryKey: KEYS.workload(projectId) });
      qc.invalidateQueries({ queryKey: KEYS.myQueue });
    },
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
        qc.invalidateQueries({ queryKey: KEYS.assignments(projectId) });
        qc.invalidateQueries({ queryKey: KEYS.workload(projectId) });
        qc.invalidateQueries({ queryKey: KEYS.myQueue });
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.assignments(projectId) });
      qc.invalidateQueries({ queryKey: KEYS.workload(projectId) });
      qc.invalidateQueries({ queryKey: KEYS.myQueue });
    },
  });
}

export function useStartReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (assignmentId: number) =>
      api.post(
        `/review/character-assignments/assignments/${assignmentId}/start`,
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
        `/review/character-assignments/assignments/${req.assignmentId}/decide`,
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
    mutationFn: (characterId: number) =>
      api.post(`/characters/${characterId}/submit-for-rereview`, {}),
    onSuccess: (_, characterId) => {
      qc.invalidateQueries({ queryKey: KEYS.reviewHistory(characterId) });
      qc.invalidateQueries({ queryKey: KEYS.myQueue });
    },
  });
}

export function useExportAuditLog(projectId: number) {
  return async (filters?: AuditLogFilters) => {
    const params = new URLSearchParams();
    if (filters?.reviewer_user_id)
      params.set("reviewer_user_id", String(filters.reviewer_user_id));
    if (filters?.action) params.set("action", filters.action);
    if (filters?.from_date) params.set("from_date", filters.from_date);
    if (filters?.to_date) params.set("to_date", filters.to_date);
    const qs = params.toString();

    const response = await api.raw(
      `/projects/${projectId}/review/audit-log/export${qs ? `?${qs}` : ""}`,
    );
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "review-audit-log.csv";
    a.click();
    URL.revokeObjectURL(url);
  };
}
