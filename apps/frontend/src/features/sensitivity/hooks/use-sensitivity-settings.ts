/**
 * TanStack Query hooks for Content Sensitivity API (PRD-82).
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";

import type {
  StudioSensitivityConfig,
  UpsertSensitivitySettings,
  UpsertStudioConfig,
  UserSensitivitySettings,
} from "../types";

/* --------------------------------------------------------------------------
   Query key factory
   -------------------------------------------------------------------------- */

export const sensitivityKeys = {
  all: ["sensitivity"] as const,
  userSettings: () => [...sensitivityKeys.all, "user-settings"] as const,
  studioConfig: () => [...sensitivityKeys.all, "studio-config"] as const,
};

/* --------------------------------------------------------------------------
   Hooks
   -------------------------------------------------------------------------- */

/** Fetch the current user's sensitivity settings. */
export function useSensitivitySettings() {
  return useQuery({
    queryKey: sensitivityKeys.userSettings(),
    queryFn: () => api.get<UserSensitivitySettings>("/user/sensitivity"),
  });
}

/** Fetch the studio-wide admin sensitivity defaults. */
export function useStudioSensitivityConfig() {
  return useQuery({
    queryKey: sensitivityKeys.studioConfig(),
    queryFn: () => api.get<StudioSensitivityConfig>("/admin/sensitivity-defaults"),
  });
}

/** Mutation to update the current user's sensitivity settings. */
export function useUpdateSensitivity() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UpsertSensitivitySettings) =>
      api.put<UserSensitivitySettings>("/user/sensitivity", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: sensitivityKeys.userSettings() });
    },
  });
}

/** Mutation to update studio-wide sensitivity defaults (admin only). */
export function useUpdateStudioConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UpsertStudioConfig) =>
      api.put<StudioSensitivityConfig>("/admin/sensitivity-defaults", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: sensitivityKeys.studioConfig() });
    },
  });
}
