/**
 * Avatar Settings Dashboard TanStack Query hooks (PRD-108).
 *
 * Provides hooks for fetching the aggregated dashboard and patching
 * avatar settings.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { fetchAvatarDashboard, patchAvatarSettings } from "../api";
import type { PatchSettingsPayload } from "../types";

/* --------------------------------------------------------------------------
   Query Keys
   -------------------------------------------------------------------------- */

export const avatarDashboardKeys = {
  all: ["avatar-dashboard"] as const,
  dashboard: (avatarId: number) =>
    ["avatar-dashboard", "dashboard", avatarId] as const,
  settings: (avatarId: number) =>
    ["avatar-dashboard", "settings", avatarId] as const,
};

/* --------------------------------------------------------------------------
   Queries
   -------------------------------------------------------------------------- */

/** Fetch the aggregated dashboard for a avatar. */
export function useAvatarDashboard(avatarId: number) {
  return useQuery({
    queryKey: avatarDashboardKeys.dashboard(avatarId),
    queryFn: () => fetchAvatarDashboard(avatarId),
    enabled: avatarId > 0,
    refetchInterval: 15_000,
  });
}

/* --------------------------------------------------------------------------
   Mutations
   -------------------------------------------------------------------------- */

/** Partially update avatar settings (merge). */
export function usePatchSettings(avatarId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (updates: PatchSettingsPayload) =>
      patchAvatarSettings(avatarId, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: avatarDashboardKeys.dashboard(avatarId),
      });
      queryClient.invalidateQueries({
        queryKey: avatarDashboardKeys.settings(avatarId),
      });
      // Settings changes affect avatar list indicators
      queryClient.invalidateQueries({
        predicate: (q) => Array.isArray(q.queryKey) && q.queryKey.includes("avatars") && q.queryKey.includes("list"),
      });
    },
  });
}
