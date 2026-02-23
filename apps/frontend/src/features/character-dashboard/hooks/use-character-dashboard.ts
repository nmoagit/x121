/**
 * Character Settings Dashboard TanStack Query hooks (PRD-108).
 *
 * Provides hooks for fetching the aggregated dashboard and patching
 * character settings.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { fetchCharacterDashboard, patchCharacterSettings } from "../api";
import type { PatchSettingsPayload } from "../types";

/* --------------------------------------------------------------------------
   Query Keys
   -------------------------------------------------------------------------- */

export const characterDashboardKeys = {
  all: ["character-dashboard"] as const,
  dashboard: (characterId: number) =>
    ["character-dashboard", "dashboard", characterId] as const,
  settings: (characterId: number) =>
    ["character-dashboard", "settings", characterId] as const,
};

/* --------------------------------------------------------------------------
   Queries
   -------------------------------------------------------------------------- */

/** Fetch the aggregated dashboard for a character. */
export function useCharacterDashboard(characterId: number) {
  return useQuery({
    queryKey: characterDashboardKeys.dashboard(characterId),
    queryFn: () => fetchCharacterDashboard(characterId),
    enabled: characterId > 0,
  });
}

/* --------------------------------------------------------------------------
   Mutations
   -------------------------------------------------------------------------- */

/** Partially update character settings (merge). */
export function usePatchSettings(characterId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (updates: PatchSettingsPayload) =>
      patchCharacterSettings(characterId, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: characterDashboardKeys.dashboard(characterId),
      });
      queryClient.invalidateQueries({
        queryKey: characterDashboardKeys.settings(characterId),
      });
    },
  });
}
