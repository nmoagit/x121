/**
 * TanStack Query hooks for activity log REST API (PRD-118).
 *
 * Provides paginated history queries and retention settings management.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";

import type {
  ActivityLogPage,
  ActivityLogQueryParams,
  ActivityLogSettings,
  UpdateActivityLogSettings,
} from "../types";

// Note: ActivityLogPage.items are ActivityLogRow (REST shape with level_id/source_id),
// NOT ActivityLogEntry (WebSocket shape with level/source strings).
// Use LEVEL_ID_MAP and SOURCE_ID_MAP from types.ts to convert for display.

/* --------------------------------------------------------------------------
   Query keys
   -------------------------------------------------------------------------- */

export const activityLogKeys = {
  all: ["activity-logs"] as const,
  list: (params: ActivityLogQueryParams) =>
    [...activityLogKeys.all, "list", params] as const,
  settings: () => [...activityLogKeys.all, "settings"] as const,
};

/* --------------------------------------------------------------------------
   Query hooks
   -------------------------------------------------------------------------- */

/** Fetch paginated activity log history with filters. */
export function useActivityLogHistory(params: ActivityLogQueryParams) {
  return useQuery({
    queryKey: activityLogKeys.list(params),
    queryFn: () => {
      const searchParams = new URLSearchParams();

      if (params.level) searchParams.set("level", params.level);
      if (params.source) searchParams.set("source", params.source);
      if (params.entity_type) searchParams.set("entity_type", params.entity_type);
      if (params.entity_id != null) searchParams.set("entity_id", String(params.entity_id));
      if (params.job_id != null) searchParams.set("job_id", String(params.job_id));
      if (params.from) searchParams.set("from", params.from);
      if (params.to) searchParams.set("to", params.to);
      if (params.search) searchParams.set("search", params.search);
      if (params.mode) searchParams.set("mode", params.mode);
      if (params.limit != null) searchParams.set("limit", String(params.limit));
      if (params.offset != null) searchParams.set("offset", String(params.offset));

      const qs = searchParams.toString();
      const path = qs ? `/activity-logs?${qs}` : "/activity-logs";
      return api.get<ActivityLogPage>(path);
    },
  });
}

/** Fetch activity log retention settings. */
export function useActivityLogSettings() {
  return useQuery({
    queryKey: activityLogKeys.settings(),
    queryFn: () => api.get<ActivityLogSettings>("/admin/activity-logs/settings"),
  });
}

/* --------------------------------------------------------------------------
   Mutation hooks
   -------------------------------------------------------------------------- */

/** Update activity log retention settings. */
export function useUpdateActivityLogSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: UpdateActivityLogSettings) =>
      api.put<ActivityLogSettings>("/admin/activity-logs/settings", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: activityLogKeys.settings() });
    },
  });
}
