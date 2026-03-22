/**
 * Delivery status query hook (PRD-39 Amendment A.4).
 */

import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";

import type { AvatarDeliveryStatus } from "../types";

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

/** Fetch per-avatar delivery status for a project.
 *  Polls every 10s when `poll` is true (e.g. while an export is in progress). */
export function useDeliveryStatus(projectId: number, poll?: boolean) {
  return useQuery({
    queryKey: deliveryStatusKeys.status(projectId),
    queryFn: () =>
      api.get<AvatarDeliveryStatus[]>(
        `/projects/${projectId}/delivery-status`,
      ),
    enabled: projectId > 0,
    refetchInterval: poll ? 10_000 : false,
  });
}
