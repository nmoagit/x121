import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

export interface ProjectReclamationSummary {
  project_id: number | null;
  project_name: string | null;
  file_count: number;
  total_bytes: number;
}

export interface ReclamationPreview {
  total_files: number;
  total_bytes: number;
  per_project: ProjectReclamationSummary[];
}

export interface TrashQueueEntry {
  id: number;
  status_id: number;
  entity_type: string;
  entity_id: number;
  file_path: string;
  file_size_bytes: number;
  policy_id: number | null;
  marked_at: string;
  delete_after: string;
  deleted_at: string | null;
  restored_at: string | null;
  restored_by: number | null;
  project_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface ReclamationRun {
  id: number;
  run_type: string;
  policy_id: number | null;
  project_id: number | null;
  files_scanned: number;
  files_marked: number;
  files_deleted: number;
  bytes_reclaimed: number;
  started_at: string;
  completed_at: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface AssetProtectionRule {
  id: number;
  name: string;
  description: string | null;
  entity_type: string;
  condition_field: string;
  condition_operator: string;
  condition_value: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ReclamationPolicy {
  id: number;
  name: string;
  description: string | null;
  scope_id: number;
  project_id: number | null;
  entity_type: string;
  condition_field: string;
  condition_operator: string;
  condition_value: string;
  age_threshold_days: number;
  grace_period_days: number;
  is_active: boolean;
  priority: number;
  created_at: string;
  updated_at: string;
}

export interface CleanupReport {
  run_id: number;
  files_scanned: number;
  files_marked: number;
  files_deleted: number;
  bytes_reclaimed: number;
  errors: string[];
}

/* --------------------------------------------------------------------------
   Query keys
   -------------------------------------------------------------------------- */

const reclamationKeys = {
  all: ["reclamation"] as const,
  preview: () => [...reclamationKeys.all, "preview"] as const,
  trash: (status?: string) => [...reclamationKeys.all, "trash", status] as const,
  history: () => [...reclamationKeys.all, "history"] as const,
  protectionRules: () => [...reclamationKeys.all, "protection-rules"] as const,
  policies: () => [...reclamationKeys.all, "policies"] as const,
};

/* --------------------------------------------------------------------------
   Hooks
   -------------------------------------------------------------------------- */

/** Fetch a preview of reclaimable space. */
export function useReclamationPreview() {
  return useQuery({
    queryKey: reclamationKeys.preview(),
    queryFn: () => api.get<ReclamationPreview>("/admin/reclamation/preview"),
  });
}

/** Fetch the trash queue entries. */
export function useTrashQueue(status?: string) {
  const params = status ? `?status=${status}` : "";
  return useQuery({
    queryKey: reclamationKeys.trash(status),
    queryFn: () => api.get<TrashQueueEntry[]>(`/admin/reclamation/trash${params}`),
  });
}

/** Fetch reclamation run history. */
export function useReclamationHistory() {
  return useQuery({
    queryKey: reclamationKeys.history(),
    queryFn: () => api.get<ReclamationRun[]>("/admin/reclamation/history"),
  });
}

/** Fetch asset protection rules. */
export function useProtectionRules() {
  return useQuery({
    queryKey: reclamationKeys.protectionRules(),
    queryFn: () => api.get<AssetProtectionRule[]>("/admin/reclamation/protection-rules"),
  });
}

/** Fetch reclamation policies. */
export function useReclamationPolicies() {
  return useQuery({
    queryKey: reclamationKeys.policies(),
    queryFn: () => api.get<ReclamationPolicy[]>("/admin/reclamation/policies"),
  });
}

/** Mutation to trigger a cleanup run. */
export function useRunCleanup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (projectId?: number) =>
      api.post<CleanupReport>("/admin/reclamation/run", {
        project_id: projectId ?? null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: reclamationKeys.all });
    },
  });
}

/** Mutation to restore a trash queue entry. */
export function useRestoreTrashEntry() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) =>
      api.post<TrashQueueEntry>(`/admin/reclamation/trash/${id}/restore`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: reclamationKeys.trash() });
      queryClient.invalidateQueries({ queryKey: reclamationKeys.preview() });
    },
  });
}
