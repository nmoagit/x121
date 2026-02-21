/**
 * TanStack Query hooks for bug reporting (PRD-44).
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";

import type {
  BugReport,
  BugReportStatus,
  CreateBugReportInput,
  UpdateBugReportStatusInput,
} from "../types";

/* --------------------------------------------------------------------------
   Query keys
   -------------------------------------------------------------------------- */

export const bugReportKeys = {
  all: ["bug-reports"] as const,
  lists: () => [...bugReportKeys.all, "list"] as const,
  list: (params?: { status?: BugReportStatus; limit?: number; offset?: number }) =>
    [...bugReportKeys.lists(), params] as const,
  detail: (id: number) => [...bugReportKeys.all, "detail", id] as const,
};

/* --------------------------------------------------------------------------
   Hooks
   -------------------------------------------------------------------------- */

/** List bug reports with optional status filter. */
export function useBugReports(params?: {
  status?: BugReportStatus;
  limit?: number;
  offset?: number;
}) {
  const searchParams = new URLSearchParams();
  if (params?.status) searchParams.set("status", params.status);
  if (params?.limit) searchParams.set("limit", String(params.limit));
  if (params?.offset) searchParams.set("offset", String(params.offset));

  const qs = searchParams.toString();
  const path = `/bug-reports${qs ? `?${qs}` : ""}`;

  return useQuery({
    queryKey: bugReportKeys.list(params),
    queryFn: () => api.get<BugReport[]>(path),
  });
}

/** Get a single bug report by ID. */
export function useBugReport(id: number) {
  return useQuery({
    queryKey: bugReportKeys.detail(id),
    queryFn: () => api.get<BugReport>(`/bug-reports/${id}`),
    enabled: id > 0,
  });
}

/** Submit a new bug report. */
export function useSubmitBugReport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateBugReportInput) =>
      api.post<BugReport>("/bug-reports", input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: bugReportKeys.lists() });
    },
  });
}

/** Update the status of a bug report. */
export function useUpdateBugReportStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      ...input
    }: UpdateBugReportStatusInput & { id: number }) =>
      api.put<BugReport>(`/bug-reports/${id}/status`, input),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: bugReportKeys.lists() });
      queryClient.invalidateQueries({
        queryKey: bugReportKeys.detail(variables.id),
      });
    },
  });
}
