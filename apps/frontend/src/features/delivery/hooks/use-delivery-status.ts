/**
 * Delivery status query hook (PRD-39 Amendment A.4).
 */

import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";

import type { CharacterDeliveryStatus } from "../types";

/* --------------------------------------------------------------------------
   Query Keys
   -------------------------------------------------------------------------- */

export const deliveryStatusKeys = {
  status: (projectId: number) =>
    ["delivery", "status", { projectId }] as const,
};

/* --------------------------------------------------------------------------
   Hooks
   -------------------------------------------------------------------------- */

/** Fetch per-character delivery status for a project. */
export function useDeliveryStatus(projectId: number) {
  return useQuery({
    queryKey: deliveryStatusKeys.status(projectId),
    queryFn: () =>
      api.get<CharacterDeliveryStatus[]>(
        `/projects/${projectId}/delivery-status`,
      ),
    enabled: projectId > 0,
  });
}
