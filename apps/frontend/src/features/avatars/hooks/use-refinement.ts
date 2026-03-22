/**
 * TanStack Query hooks for LLM-driven metadata refinement (PRD-125).
 *
 * Covers refinement job triggering, approval, rejection, and outdated clearing.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type { RefinementJob } from "../types";
import { avatarDetailKeys } from "./use-avatar-detail";
import { metadataVersionKeys } from "./use-metadata-versions";

/* --------------------------------------------------------------------------
   Query key factory
   -------------------------------------------------------------------------- */

export const refinementKeys = {
  list: (avatarId: number) =>
    ["avatars", avatarId, "refinement-jobs"] as const,
  detail: (uuid: string) => ["refinement-jobs", uuid] as const,
};

/* --------------------------------------------------------------------------
   Queries
   -------------------------------------------------------------------------- */

/** Fetch all refinement jobs for a avatar. */
export function useRefinementJobs(avatarId: number) {
  return useQuery({
    queryKey: refinementKeys.list(avatarId),
    queryFn: () =>
      api.get<RefinementJob[]>(
        `/avatars/${avatarId}/refinement-jobs`,
      ),
    enabled: avatarId > 0,
  });
}

/* --------------------------------------------------------------------------
   Mutations
   -------------------------------------------------------------------------- */

/** Trigger a new LLM refinement job. */
export function useTriggerRefinement(avatarId: number) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (enrich?: boolean) =>
      api.post<RefinementJob>(
        `/avatars/${avatarId}/refinement`,
        { enrich: enrich ?? true },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: refinementKeys.list(avatarId) });
    },
  });
}

/** Approve a completed refinement job (optionally cherry-picking fields). */
export function useApproveRefinement(avatarId: number) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({
      jobUuid,
      selectedFields,
    }: {
      jobUuid: string;
      selectedFields?: string[];
    }) =>
      api.post<RefinementJob>(
        `/avatars/${avatarId}/refinement-jobs/${jobUuid}/approve`,
        { selected_fields: selectedFields },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: refinementKeys.list(avatarId) });
      qc.invalidateQueries({
        queryKey: avatarDetailKeys.metadata(avatarId),
      });
      qc.invalidateQueries({
        queryKey: metadataVersionKeys.list(avatarId),
      });
    },
  });
}

/** Reject a completed refinement job. */
export function useRejectRefinement(avatarId: number) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({
      jobUuid,
      reason,
    }: {
      jobUuid: string;
      reason?: string;
    }) =>
      api.post(
        `/avatars/${avatarId}/refinement-jobs/${jobUuid}/reject`,
        { reason },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: refinementKeys.list(avatarId) });
    },
  });
}

/** Clear the outdated flag on a metadata version. */
export function useClearOutdated(avatarId: number) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (versionId: number) =>
      api.post(
        `/avatars/${avatarId}/metadata/versions/${versionId}/clear-outdated`,
        {},
      ),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: metadataVersionKeys.list(avatarId),
      });
    },
  });
}
