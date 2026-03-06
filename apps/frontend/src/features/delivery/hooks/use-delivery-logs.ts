/**
 * Delivery log query hooks (PRD-39 Amendment A.3).
 */

import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";

import type { DeliveryLog } from "../types";

/* --------------------------------------------------------------------------
   Query Keys
   -------------------------------------------------------------------------- */

export const deliveryLogKeys = {
  logs: (projectId: number, level?: string) =>
    ["delivery", "logs", { projectId, level }] as const,
};

/* --------------------------------------------------------------------------
   Hooks
   -------------------------------------------------------------------------- */

/** Fetch delivery logs for a project with optional level filter. */
export function useDeliveryLogs(
  projectId: number,
  level?: string,
  limit?: number,
) {
  const params = new URLSearchParams();
  if (level) params.set("level", level);
  if (limit) params.set("limit", String(limit));
  const qs = params.toString();
  const suffix = qs ? `?${qs}` : "";

  return useQuery({
    queryKey: deliveryLogKeys.logs(projectId, level),
    queryFn: () =>
      api.get<DeliveryLog[]>(
        `/projects/${projectId}/delivery-logs${suffix}`,
      ),
    enabled: projectId > 0,
  });
}
