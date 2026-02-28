/**
 * TanStack Query hooks for Production Reporting & Data Export (PRD-73).
 *
 * Follows the key factory pattern used throughout the codebase.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type {
  CreateReportInput,
  CreateScheduleInput,
  Report,
  ReportSchedule,
  ReportType,
  UpdateScheduleInput,
} from "../types";

/* --------------------------------------------------------------------------
   Query keys
   -------------------------------------------------------------------------- */

export const reportKeys = {
  all: ["reports"] as const,
  types: () => [...reportKeys.all, "types"] as const,
  list: () => [...reportKeys.all, "list"] as const,
  detail: (id: number) => [...reportKeys.all, "detail", id] as const,
  schedules: () => [...reportKeys.all, "schedules"] as const,
};

/* --------------------------------------------------------------------------
   Report type queries
   -------------------------------------------------------------------------- */

/** Fetches all available report type templates. */
export function useReportTypes() {
  return useQuery({
    queryKey: reportKeys.types(),
    queryFn: () => api.get<ReportType[]>("/reports/templates"),
  });
}

/* --------------------------------------------------------------------------
   Report queries
   -------------------------------------------------------------------------- */

/** Fetches paginated list of generated reports. */
export function useReports(limit = 20, offset = 0) {
  return useQuery({
    queryKey: [...reportKeys.list(), limit, offset] as const,
    queryFn: () =>
      api.get<Report[]>(`/reports?limit=${limit}&offset=${offset}`),
  });
}

/** Fetches a single report by ID. */
export function useReport(id: number | undefined) {
  return useQuery({
    queryKey: reportKeys.detail(id ?? 0),
    queryFn: () => api.get<Report>(`/reports/${id}`),
    enabled: id !== undefined && id > 0,
  });
}

/* --------------------------------------------------------------------------
   Schedule queries
   -------------------------------------------------------------------------- */

/** Fetches all report schedules. */
export function useReportSchedules() {
  return useQuery({
    queryKey: reportKeys.schedules(),
    queryFn: () => api.get<ReportSchedule[]>("/report-schedules"),
  });
}

/* --------------------------------------------------------------------------
   Report mutations
   -------------------------------------------------------------------------- */

/** Generates a new report. */
export function useGenerateReport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateReportInput) =>
      api.post<Report>("/reports/generate", input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: reportKeys.list() });
    },
  });
}

/* --------------------------------------------------------------------------
   Schedule mutations
   -------------------------------------------------------------------------- */

/** Creates a new report schedule. */
export function useCreateSchedule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateScheduleInput) =>
      api.post<ReportSchedule>("/report-schedules", input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: reportKeys.schedules() });
    },
  });
}

/** Updates an existing report schedule. */
export function useUpdateSchedule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateScheduleInput }) =>
      api.put<ReportSchedule>(`/report-schedules/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: reportKeys.schedules() });
    },
  });
}

/** Deletes a report schedule. */
export function useDeleteSchedule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => api.delete(`/report-schedules/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: reportKeys.schedules() });
    },
  });
}
