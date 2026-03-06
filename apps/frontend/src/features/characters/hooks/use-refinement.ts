/**
 * TanStack Query hooks for LLM-driven metadata refinement (PRD-125).
 *
 * Covers refinement job triggering, approval, rejection, and outdated clearing.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type { RefinementJob } from "../types";
import { characterDetailKeys } from "./use-character-detail";
import { metadataVersionKeys } from "./use-metadata-versions";

/* --------------------------------------------------------------------------
   Query key factory
   -------------------------------------------------------------------------- */

export const refinementKeys = {
  list: (characterId: number) =>
    ["characters", characterId, "refinement-jobs"] as const,
  detail: (uuid: string) => ["refinement-jobs", uuid] as const,
};

/* --------------------------------------------------------------------------
   Queries
   -------------------------------------------------------------------------- */

/** Fetch all refinement jobs for a character. */
export function useRefinementJobs(characterId: number) {
  return useQuery({
    queryKey: refinementKeys.list(characterId),
    queryFn: () =>
      api.get<RefinementJob[]>(
        `/characters/${characterId}/refinement-jobs`,
      ),
    enabled: characterId > 0,
  });
}

/* --------------------------------------------------------------------------
   Mutations
   -------------------------------------------------------------------------- */

/** Trigger a new LLM refinement job. */
export function useTriggerRefinement(characterId: number) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (enrich?: boolean) =>
      api.post<RefinementJob>(
        `/characters/${characterId}/refinement`,
        { enrich: enrich ?? true },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: refinementKeys.list(characterId) });
    },
  });
}

/** Approve a completed refinement job (optionally cherry-picking fields). */
export function useApproveRefinement(characterId: number) {
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
        `/characters/${characterId}/refinement-jobs/${jobUuid}/approve`,
        { selected_fields: selectedFields },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: refinementKeys.list(characterId) });
      qc.invalidateQueries({
        queryKey: characterDetailKeys.metadata(characterId),
      });
      qc.invalidateQueries({
        queryKey: metadataVersionKeys.list(characterId),
      });
    },
  });
}

/** Reject a completed refinement job. */
export function useRejectRefinement(characterId: number) {
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
        `/characters/${characterId}/refinement-jobs/${jobUuid}/reject`,
        { reason },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: refinementKeys.list(characterId) });
    },
  });
}

/** Clear the outdated flag on a metadata version. */
export function useClearOutdated(characterId: number) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (versionId: number) =>
      api.post(
        `/characters/${characterId}/metadata/versions/${versionId}/clear-outdated`,
        {},
      ),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: metadataVersionKeys.list(characterId),
      });
    },
  });
}
