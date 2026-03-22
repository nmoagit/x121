/**
 * Avatar Settings Dashboard API functions (PRD-108).
 */

import { api } from "@/lib/api";

import type { AvatarDashboardData, PatchSettingsPayload } from "./types";

/** Fetch the aggregated dashboard for a avatar. */
export function fetchAvatarDashboard(
  avatarId: number,
): Promise<AvatarDashboardData> {
  return api.get(`/avatars/${avatarId}/dashboard`);
}

/** Partially update a avatar's settings (merge, not replace). */
export function patchAvatarSettings(
  avatarId: number,
  updates: PatchSettingsPayload,
): Promise<Record<string, unknown>> {
  return api.patch(`/avatars/${avatarId}/settings`, updates);
}
