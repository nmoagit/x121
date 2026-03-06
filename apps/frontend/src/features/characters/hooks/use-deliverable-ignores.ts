/**
 * TanStack Query hooks for character deliverable ignores (PRD-126, Task 2.1).
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
  character_id: number;
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
  list: (characterId: number) =>
    ["characters", characterId, "deliverable-ignores"] as const,
};

/* --------------------------------------------------------------------------
   Hooks
   -------------------------------------------------------------------------- */

/** Fetch all deliverable ignores for a character. */
export function useDeliverableIgnores(characterId: number) {
  return useQuery({
    queryKey: deliverableIgnoreKeys.list(characterId),
    queryFn: () =>
      api.get<DeliverableIgnore[]>(
        `/characters/${characterId}/deliverable-ignores`,
      ),
    enabled: characterId > 0,
  });
}

/** Add an ignore entry (upsert — safe to call if already ignored). */
export function useAddDeliverableIgnore(characterId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: AddIgnoreInput) =>
      api.post<DeliverableIgnore>(
        `/characters/${characterId}/deliverable-ignores`,
        input,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: deliverableIgnoreKeys.list(characterId),
      });
    },
  });
}

/** Remove an ignore entry by UUID. */
export function useRemoveDeliverableIgnore(characterId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (uuid: string) =>
      api.delete(
        `/characters/${characterId}/deliverable-ignores/${uuid}`,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: deliverableIgnoreKeys.list(characterId),
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
