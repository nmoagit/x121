/**
 * TanStack Query hooks for avatar deliverable ignores (PRD-126, Task 2.1).
 *
 * Allows marking specific scene_type + track combinations as intentionally
 * skipped, excluding them from readiness calculations and delivery validation.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

export interface DeliverableIgnore {
  id: number;
  uuid: string;
  avatar_id: number;
  scene_type_id: number;
  track_id: number | null;
  ignored_by: string | null;
  reason: string | null;
  created_at: string;
}

interface AddIgnoreInput {
  scene_type_id: number;
  track_id?: number | null;
  reason?: string;
}

/* --------------------------------------------------------------------------
   Query keys
   -------------------------------------------------------------------------- */

export const deliverableIgnoreKeys = {
  list: (avatarId: number) =>
    ["avatars", avatarId, "deliverable-ignores"] as const,
};

/* --------------------------------------------------------------------------
   Hooks
   -------------------------------------------------------------------------- */

/** Fetch all deliverable ignores for a avatar. */
export function useDeliverableIgnores(avatarId: number) {
  return useQuery({
    queryKey: deliverableIgnoreKeys.list(avatarId),
    queryFn: () =>
      api.get<DeliverableIgnore[]>(
        `/avatars/${avatarId}/deliverable-ignores`,
      ),
    enabled: avatarId > 0,
  });
}

/** Add an ignore entry (upsert — safe to call if already ignored). */
export function useAddDeliverableIgnore(avatarId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: AddIgnoreInput) =>
      api.post<DeliverableIgnore>(
        `/avatars/${avatarId}/deliverable-ignores`,
        input,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: deliverableIgnoreKeys.list(avatarId),
      });
    },
  });
}

/** Remove an ignore entry by UUID. */
export function useRemoveDeliverableIgnore(avatarId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (uuid: string) =>
      api.delete(
        `/avatars/${avatarId}/deliverable-ignores/${uuid}`,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: deliverableIgnoreKeys.list(avatarId),
      });
    },
  });
}

/** Check if a specific scene_type + track combo is ignored. */
export function isIgnored(
  ignores: DeliverableIgnore[] | undefined,
  sceneTypeId: number,
  trackId: number | null,
): DeliverableIgnore | undefined {
  if (!ignores) return undefined;
  return ignores.find(
    (ig) => ig.scene_type_id === sceneTypeId && ig.track_id === (trackId ?? null),
  );
}
