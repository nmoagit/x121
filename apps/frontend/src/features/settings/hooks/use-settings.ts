/**
 * TanStack Query hooks for admin platform settings (PRD-110).
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";

import type {
  ConnectionTestResult,
  PlatformSetting,
  SettingsListResponse,
} from "../types";

/* --------------------------------------------------------------------------
   Query keys
   -------------------------------------------------------------------------- */

const settingsKeys = {
  all: ["admin-settings"] as const,
  list: () => [...settingsKeys.all, "list"] as const,
  detail: (key: string) => [...settingsKeys.all, "detail", key] as const,
};

/* --------------------------------------------------------------------------
   Query hooks
   -------------------------------------------------------------------------- */

/** Fetch all platform settings. */
export function useSettings() {
  return useQuery({
    queryKey: settingsKeys.list(),
    queryFn: () => api.get<SettingsListResponse>("/admin/settings"),
  });
}

/** Fetch a single platform setting by key. */
export function useSetting(key: string) {
  return useQuery({
    queryKey: settingsKeys.detail(key),
    queryFn: () => api.get<PlatformSetting>(`/admin/settings/${key}`),
    enabled: !!key,
  });
}

/* --------------------------------------------------------------------------
   Mutation hooks
   -------------------------------------------------------------------------- */

/** Update a setting's value. */
export function useUpdateSetting() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ key, value }: { key: string; value: string }) =>
      api.patch<PlatformSetting>(`/admin/settings/${key}`, { value }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: settingsKeys.all });
    },
  });
}

/** Reset a setting to its default value. */
export function useResetSetting() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (key: string) =>
      api.delete<PlatformSetting>(`/admin/settings/${key}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: settingsKeys.all });
    },
  });
}

/** Test connectivity for a URL/WsUrl setting. */
export function useTestConnection() {
  return useMutation({
    mutationFn: ({ key, url }: { key: string; url: string }) =>
      api.post<ConnectionTestResult>(
        `/admin/settings/${key}/actions/test`,
        { url },
      ),
  });
}
