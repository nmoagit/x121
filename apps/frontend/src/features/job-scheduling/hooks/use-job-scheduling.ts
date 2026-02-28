/**
 * TanStack Query hooks for time-based job scheduling (PRD-119).
 *
 * Follows the key factory pattern used throughout the codebase.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type {
  CreateSchedule,
  OffPeakConfig,
  Schedule,
  ScheduleHistory,
  UpdateOffPeakConfig,
  UpdateSchedule,
} from "../types";

/* --------------------------------------------------------------------------
   Query key factory
   -------------------------------------------------------------------------- */

export const scheduleKeys = {
  all: ["schedules"] as const,
  list: (params?: Record<string, string>) =>
    [...scheduleKeys.all, "list", params] as const,
  detail: (id: number) => [...scheduleKeys.all, "detail", id] as const,
  history: (id: number) => [...scheduleKeys.all, "history", id] as const,
  offPeak: () => [...scheduleKeys.all, "off-peak"] as const,
};

/* --------------------------------------------------------------------------
   Schedule queries
   -------------------------------------------------------------------------- */

/** Fetch all schedules with optional filter params. */
export function useSchedules(params?: Record<string, string>) {
  const qs = params ? `?${new URLSearchParams(params).toString()}` : "";
  return useQuery({
    queryKey: scheduleKeys.list(params),
    queryFn: () => api.get<Schedule[]>(`/schedules${qs}`),
  });
}

/** Fetch a single schedule by ID. */
export function useSchedule(id: number) {
  return useQuery({
    queryKey: scheduleKeys.detail(id),
    queryFn: () => api.get<Schedule>(`/schedules/${id}`),
    enabled: id > 0,
  });
}

/** Fetch execution history for a schedule. */
export function useScheduleHistory(id: number) {
  return useQuery({
    queryKey: scheduleKeys.history(id),
    queryFn: () => api.get<ScheduleHistory[]>(`/schedules/${id}/history`),
    enabled: id > 0,
  });
}

/* --------------------------------------------------------------------------
   Off-peak config queries
   -------------------------------------------------------------------------- */

/** Fetch the global off-peak configuration windows. */
export function useOffPeakConfig() {
  return useQuery({
    queryKey: scheduleKeys.offPeak(),
    queryFn: () => api.get<OffPeakConfig[]>("/schedules/off-peak"),
  });
}

/* --------------------------------------------------------------------------
   Schedule mutations
   -------------------------------------------------------------------------- */

/** Create a new schedule. */
export function useCreateSchedule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateSchedule) =>
      api.post<Schedule>("/schedules", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: scheduleKeys.all });
    },
  });
}

/** Update an existing schedule. */
export function useUpdateSchedule(id: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UpdateSchedule) =>
      api.put<Schedule>(`/schedules/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: scheduleKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: scheduleKeys.list() });
    },
  });
}

/** Delete a schedule. */
export function useDeleteSchedule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => api.delete(`/schedules/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: scheduleKeys.all });
    },
  });
}

/** Pause an active schedule. */
export function usePauseSchedule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => api.post<Schedule>(`/schedules/${id}/pause`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: scheduleKeys.all });
    },
  });
}

/** Resume a paused schedule. */
export function useResumeSchedule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => api.post<Schedule>(`/schedules/${id}/resume`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: scheduleKeys.all });
    },
  });
}

/* --------------------------------------------------------------------------
   Off-peak config mutations
   -------------------------------------------------------------------------- */

/** Update the global off-peak configuration windows. */
export function useUpdateOffPeakConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UpdateOffPeakConfig) =>
      api.put<OffPeakConfig[]>("/schedules/off-peak", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: scheduleKeys.offPeak() });
    },
  });
}
