/**
 * TanStack Query hooks for audit logging & compliance (PRD-45).
 *
 * Follows the key factory pattern used throughout the codebase.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type {
  AuditLogPage,
  AuditQueryParams,
  AuditRetentionPolicy,
  IntegrityCheckResult,
  UpdateRetentionPolicy,
} from "../types";

/* --------------------------------------------------------------------------
   Query keys
   -------------------------------------------------------------------------- */

export const auditKeys = {
  all: ["audit"] as const,
  logs: (params: AuditQueryParams) =>
    [...auditKeys.all, "logs", params] as const,
  retention: () => [...auditKeys.all, "retention"] as const,
  integrity: () => [...auditKeys.all, "integrity"] as const,
};

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

/** Build query string from AuditQueryParams (skipping undefined values). */
function buildQueryString(params: AuditQueryParams): string {
  const searchParams = new URLSearchParams();
  if (params.user_id !== undefined)
    searchParams.set("user_id", String(params.user_id));
  if (params.action_type) searchParams.set("action_type", params.action_type);
  if (params.entity_type) searchParams.set("entity_type", params.entity_type);
  if (params.entity_id !== undefined)
    searchParams.set("entity_id", String(params.entity_id));
  if (params.from) searchParams.set("from", params.from);
  if (params.to) searchParams.set("to", params.to);
  if (params.search_text) searchParams.set("search_text", params.search_text);
  if (params.limit !== undefined)
    searchParams.set("limit", String(params.limit));
  if (params.offset !== undefined)
    searchParams.set("offset", String(params.offset));
  const qs = searchParams.toString();
  return qs ? `?${qs}` : "";
}

/* --------------------------------------------------------------------------
   Audit log hooks
   -------------------------------------------------------------------------- */

/** Fetch paginated audit logs with filters. */
export function useAuditLogs(params: AuditQueryParams) {
  return useQuery({
    queryKey: auditKeys.logs(params),
    queryFn: () =>
      api.get<AuditLogPage>(
        `/admin/audit-logs${buildQueryString(params)}`,
      ),
  });
}

/** Run integrity check on the audit log chain. */
export function useIntegrityCheck() {
  return useQuery({
    queryKey: auditKeys.integrity(),
    queryFn: () =>
      api.get<IntegrityCheckResult>("/admin/audit-logs/integrity-check"),
    enabled: false, // Only run on demand.
  });
}

/* --------------------------------------------------------------------------
   Retention policy hooks
   -------------------------------------------------------------------------- */

/** List all retention policies. */
export function useRetentionPolicies() {
  return useQuery({
    queryKey: auditKeys.retention(),
    queryFn: () =>
      api.get<AuditRetentionPolicy[]>("/admin/audit-logs/retention"),
  });
}

/** Update a retention policy by category. */
export function useUpdateRetentionPolicy() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      category,
      data,
    }: {
      category: string;
      data: UpdateRetentionPolicy;
    }) =>
      api.put<AuditRetentionPolicy>(
        `/admin/audit-logs/retention/${category}`,
        data,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: auditKeys.retention() });
    },
  });
}

/* --------------------------------------------------------------------------
   Export helper
   -------------------------------------------------------------------------- */

/** Trigger a CSV or JSON export download. */
export async function exportAuditLogs(
  format: "csv" | "json",
  from?: string,
  to?: string,
): Promise<void> {
  const params = new URLSearchParams({ format });
  if (from) params.set("from", from);
  if (to) params.set("to", to);

  const url = `/api/v1/admin/audit-logs/export?${params.toString()}`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${localStorage.getItem("access_token") ?? ""}`,
    },
  });

  if (!response.ok) throw new Error("Export failed");

  const blob = await response.blob();
  const downloadUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = downloadUrl;
  a.download = `audit-logs.${format}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(downloadUrl);
}
