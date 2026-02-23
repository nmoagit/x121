/**
 * Provenance TanStack Query hooks (PRD-69).
 *
 * Provides hooks for creating/completing generation receipts,
 * querying segment provenance, asset usage, and staleness reports.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";

import type {
  AssetUsageEntry,
  CompleteReceiptRequest,
  CreateReceiptRequest,
  GenerationReceipt,
  StalenessReportEntry,
} from "../types";

/* --------------------------------------------------------------------------
   Query Keys
   -------------------------------------------------------------------------- */

export const provenanceKeys = {
  all: ["provenance"] as const,
  segment: (segmentId: number) =>
    ["provenance", "segment", segmentId] as const,
  assetUsage: (assetId: number, version?: string) =>
    ["provenance", "asset-usage", { assetId, version }] as const,
  staleness: (projectId?: number) =>
    ["provenance", "staleness", { projectId }] as const,
};

/* --------------------------------------------------------------------------
   Queries
   -------------------------------------------------------------------------- */

/** Fetch the most recent generation receipt for a segment. */
export function useSegmentProvenance(segmentId: number) {
  return useQuery({
    queryKey: provenanceKeys.segment(segmentId),
    queryFn: () =>
      api.get<GenerationReceipt | null>(
        `/segments/${segmentId}/provenance`,
      ),
    enabled: segmentId > 0,
  });
}

/** Fetch reverse provenance: which segments used a given asset. */
export function useAssetUsage(assetId: number, version?: string) {
  const params = new URLSearchParams();
  if (version != null) {
    params.set("version", version);
  }
  const qs = params.toString();
  const path = `/assets/${assetId}/usage${qs ? `?${qs}` : ""}`;

  return useQuery({
    queryKey: provenanceKeys.assetUsage(assetId, version),
    queryFn: () => api.get<AssetUsageEntry[]>(path),
    enabled: assetId > 0,
  });
}

/** Fetch a staleness report: segments whose model version no longer matches. */
export function useStalenessReport(projectId?: number) {
  const params = new URLSearchParams();
  if (projectId != null) {
    params.set("project_id", String(projectId));
  }
  const qs = params.toString();
  const path = `/provenance/staleness${qs ? `?${qs}` : ""}`;

  return useQuery({
    queryKey: provenanceKeys.staleness(projectId),
    queryFn: () => api.get<StalenessReportEntry[]>(path),
  });
}

/* --------------------------------------------------------------------------
   Mutations
   -------------------------------------------------------------------------- */

/** Create a new generation receipt. */
export function useCreateReceipt() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateReceiptRequest) =>
      api.post<GenerationReceipt>("/provenance/receipts", input),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: provenanceKeys.segment(variables.segment_id),
      });
    },
  });
}

/** Complete a generation receipt by setting timing fields. */
export function useCompleteReceipt() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      receiptId,
      ...body
    }: CompleteReceiptRequest & { receiptId: number }) =>
      api.patch<boolean>(
        `/provenance/receipts/${receiptId}/complete`,
        body,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: provenanceKeys.all,
      });
    },
  });
}
