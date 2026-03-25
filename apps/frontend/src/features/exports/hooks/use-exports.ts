/**
 * TanStack Query hooks for bulk export jobs (PRD-151).
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

export interface ExportPart {
  part: number;
  file: string;
  size_bytes: number;
  file_count: number;
}

export interface ExportJob {
  id: number;
  entity_type: string;
  requested_by: number;
  pipeline_id: number | null;
  item_count: number;
  split_size_mb: number;
  filter_snapshot: Record<string, unknown> | null;
  status: "queued" | "processing" | "completed" | "failed";
  parts: ExportPart[];
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateExportInput {
  entity_type: "scene_video_version" | "media_variant";
  ids?: number[];
  filters?: Record<string, unknown>;
  split_size_mb?: number;
}

/* --------------------------------------------------------------------------
   Query key factory
   -------------------------------------------------------------------------- */

export const exportKeys = {
  all: ["exports"] as const,
  detail: (id: number) => [...exportKeys.all, "detail", id] as const,
};

/* --------------------------------------------------------------------------
   Hooks
   -------------------------------------------------------------------------- */

/** Create a new export job. Returns the created job (status 202). */
export function useCreateExport() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateExportInput) => {
      const result = await api.post<ExportJob>("/exports", input);
      return result;
    },
    onSuccess: (job) => {
      qc.setQueryData(exportKeys.detail(job.id), job);
    },
  });
}

/** Poll an export job's status. Refetches every 2s while the job is active. */
export function useExportStatus(jobId: number | null) {
  return useQuery({
    queryKey: jobId != null ? exportKeys.detail(jobId) : ["exports", "none"],
    queryFn: async () => {
      if (jobId == null) throw new Error("No job ID");
      return api.get<ExportJob>(`/exports/${jobId}`);
    },
    enabled: jobId != null,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status === "queued" || status === "processing") return 2000;
      return false;
    },
  });
}
