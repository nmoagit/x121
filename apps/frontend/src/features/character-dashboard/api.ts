/**
 * Character Settings Dashboard API functions (PRD-108).
 */

import { api } from "@/lib/api";

import type { CharacterDashboardData, PatchSettingsPayload } from "./types";

/** Fetch the aggregated dashboard for a character. */
export function fetchCharacterDashboard(
  characterId: number,
): Promise<CharacterDashboardData> {
  return api.get(`/characters/${characterId}/dashboard`);
}

/** Partially update a character's settings (merge, not replace). */
export function patchCharacterSettings(
  characterId: number,
  updates: PatchSettingsPayload,
): Promise<Record<string, unknown>> {
  return api.patch(`/characters/${characterId}/settings`, updates);
}
