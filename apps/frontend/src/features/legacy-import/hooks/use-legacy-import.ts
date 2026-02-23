/**
 * Legacy Import TanStack Query hooks (PRD-86).
 *
 * Provides hooks for creating, scanning, previewing, committing, and
 * reporting on legacy import runs and entity logs.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";

import type {
  CommitImportRequest,
  CreateImportRun,
  CsvImportRequest,
  EntityLog,
  GapReport,
  InferredEntity,
  LegacyImportRun,
  PreviewImportRequest,
  RunReport,
  ScanFolderRequest,
} from "../types";

/* --------------------------------------------------------------------------
   Query Keys
   -------------------------------------------------------------------------- */

export const legacyImportKeys = {
  all: ["legacy-import"] as const,
  runs: (projectId: number) =>
    ["legacy-import", "runs", projectId] as const,
  run: (id: number) => ["legacy-import", "run", id] as const,
  report: (id: number) => ["legacy-import", "report", id] as const,
  gapReport: (id: number) => ["legacy-import", "gap-report", id] as const,
  entities: (runId: number) =>
    ["legacy-import", "entities", runId] as const,
};

/* --------------------------------------------------------------------------
   Queries
   -------------------------------------------------------------------------- */

/** Fetch a single import run by ID. */
export function useImportRun(id: number) {
  return useQuery({
    queryKey: legacyImportKeys.run(id),
    queryFn: () =>
      api.get<LegacyImportRun>(`/admin/import/legacy/runs/${id}`),
    enabled: id > 0,
  });
}

/** List import runs for a project. */
export function useImportRuns(
  projectId: number,
  limit?: number,
  offset?: number,
) {
  const params = new URLSearchParams();
  params.set("project_id", String(projectId));
  if (limit != null) params.set("limit", String(limit));
  if (offset != null) params.set("offset", String(offset));

  return useQuery({
    queryKey: legacyImportKeys.runs(projectId),
    queryFn: () =>
      api.get<LegacyImportRun[]>(
        `/admin/import/legacy/runs?${params.toString()}`,
      ),
    enabled: projectId > 0,
  });
}

/** Fetch the full report for an import run. */
export function useRunReport(id: number) {
  return useQuery({
    queryKey: legacyImportKeys.report(id),
    queryFn: () =>
      api.get<RunReport>(`/admin/import/legacy/runs/${id}/report`),
    enabled: id > 0,
  });
}

/** Fetch the gap analysis report for an import run. */
export function useGapReport(id: number) {
  return useQuery({
    queryKey: legacyImportKeys.gapReport(id),
    queryFn: () =>
      api.get<GapReport>(`/admin/import/legacy/runs/${id}/gap-report`),
    enabled: id > 0,
  });
}

/** List entity log entries for a run. */
export function useEntityLogs(
  runId: number,
  limit?: number,
  offset?: number,
) {
  const params = new URLSearchParams();
  if (limit != null) params.set("limit", String(limit));
  if (offset != null) params.set("offset", String(offset));
  const qs = params.toString();
  const path = qs
    ? `/admin/import/legacy/runs/${runId}/entities?${qs}`
    : `/admin/import/legacy/runs/${runId}/entities`;

  return useQuery({
    queryKey: legacyImportKeys.entities(runId),
    queryFn: () => api.get<EntityLog[]>(path),
    enabled: runId > 0,
  });
}

/* --------------------------------------------------------------------------
   Mutations
   -------------------------------------------------------------------------- */

/** Create a new import run. */
export function useCreateRun() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateImportRun) =>
      api.post<LegacyImportRun>("/admin/import/legacy/runs", input),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: legacyImportKeys.runs(variables.project_id),
      });
    },
  });
}

/** Scan a folder and return inferred entities. */
export function useScanFolder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ runId, input }: { runId: number; input: ScanFolderRequest }) =>
      api.post<InferredEntity[]>(
        `/admin/import/legacy/runs/${runId}/scan`,
        input,
      ),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: legacyImportKeys.run(variables.runId),
      });
    },
  });
}

/** Generate a preview for an import. */
export function usePreviewImport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      runId,
      input,
    }: {
      runId: number;
      input: PreviewImportRequest;
    }) =>
      api.post<LegacyImportRun>(
        `/admin/import/legacy/runs/${runId}/preview`,
        input,
      ),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: legacyImportKeys.run(variables.runId),
      });
    },
  });
}

/** Commit an import run. */
export function useCommitImport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      runId,
      input,
    }: {
      runId: number;
      input: CommitImportRequest;
    }) =>
      api.post<LegacyImportRun>(
        `/admin/import/legacy/runs/${runId}/commit`,
        input,
      ),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: legacyImportKeys.run(variables.runId),
      });
      queryClient.invalidateQueries({
        queryKey: legacyImportKeys.report(variables.runId),
      });
    },
  });
}

/** Import CSV data for a run. */
export function useCsvImport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      runId,
      input,
    }: {
      runId: number;
      input: CsvImportRequest;
    }) =>
      api.post<EntityLog>(
        `/admin/import/legacy/runs/${runId}/csv`,
        input,
      ),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: legacyImportKeys.entities(variables.runId),
      });
    },
  });
}
