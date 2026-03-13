/**
 * TanStack Query hooks for character metadata versioning.
 *
 * Covers version CRUD, generation, activation, and rejection.
 */

import type { QueryClient } from "@tanstack/react-query";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type { MetadataVersion } from "../types";
import { characterDetailKeys } from "./use-character-detail";

/* --------------------------------------------------------------------------
   Query key factory
   -------------------------------------------------------------------------- */

export const metadataVersionKeys = {
  list: (characterId: number) =>
    ["characters", characterId, "metadata", "versions"] as const,
  detail: (characterId: number, versionId: number) =>
    ["characters", characterId, "metadata", "versions", versionId] as const,
};

/* --------------------------------------------------------------------------
   Shared invalidation
   -------------------------------------------------------------------------- */

/** Invalidate version list and character metadata queries. */
function invalidateVersionsAndMetadata(qc: QueryClient, characterId: number) {
  qc.invalidateQueries({ queryKey: metadataVersionKeys.list(characterId) });
  qc.invalidateQueries({ queryKey: characterDetailKeys.metadata(characterId) });
}

/** Invalidate version list only. */
function invalidateVersions(qc: QueryClient, characterId: number) {
  qc.invalidateQueries({ queryKey: metadataVersionKeys.list(characterId) });
}

/* --------------------------------------------------------------------------
   Queries
   -------------------------------------------------------------------------- */

/** Fetch all metadata versions for a character. */
export function useMetadataVersions(characterId: number) {
  return useQuery({
    queryKey: metadataVersionKeys.list(characterId),
    queryFn: () =>
      api.get<MetadataVersion[]>(
        `/characters/${characterId}/metadata/versions`,
      ),
    enabled: characterId > 0,
  });
}

/* --------------------------------------------------------------------------
   Mutations
   -------------------------------------------------------------------------- */

/** Generate metadata from bio/tov source files (backend transform). */
export function useGenerateMetadata(characterId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: {
      bio_json?: Record<string, unknown> | null;
      tov_json?: Record<string, unknown> | null;
      activate?: boolean;
    }) =>
      api.post<MetadataVersion>(
        `/characters/${characterId}/metadata/versions/generate`,
        data,
      ),
    onSuccess: () => invalidateVersionsAndMetadata(queryClient, characterId),
  });
}

/** Create a manual metadata version (or json_import / csv_import). */
export function useCreateManualVersion(characterId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: {
      metadata: Record<string, unknown>;
      notes?: string;
      activate?: boolean;
      source?: string;
    }) =>
      api.post<MetadataVersion>(
        `/characters/${characterId}/metadata/versions`,
        data,
      ),
    onSuccess: () => invalidateVersionsAndMetadata(queryClient, characterId),
  });
}

/** Activate a metadata version (syncs to characters.metadata). */
export function useActivateVersion(characterId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (versionId: number) =>
      api.put<MetadataVersion>(
        `/characters/${characterId}/metadata/versions/${versionId}/activate`,
        {},
      ),
    onSuccess: () => invalidateVersionsAndMetadata(queryClient, characterId),
  });
}

/** Reject a metadata version with a reason. */
export function useRejectVersion(characterId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: { versionId: number; reason: string }) =>
      api.put<MetadataVersion>(
        `/characters/${characterId}/metadata/versions/${data.versionId}/reject`,
        { reason: data.reason },
      ),
    onSuccess: () => invalidateVersions(queryClient, characterId),
  });
}

/** Mark all active metadata versions as outdated (e.g. when Bio/ToV source files change). */
export function useMarkOutdated(characterId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (reason: string) =>
      api.post(`/characters/${characterId}/metadata/mark-outdated`, { reason }),
    onSuccess: () => invalidateVersions(queryClient, characterId),
  });
}

/** Approve a metadata version (reviewer action). */
export function useApproveMetadataVersion(characterId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (versionId: number) =>
      api.post<MetadataVersion>(
        `/characters/${characterId}/metadata/versions/${versionId}/approve`,
        {},
      ),
    onSuccess: () => invalidateVersionsAndMetadata(queryClient, characterId),
  });
}

/** Revert an approved/rejected metadata version back to pending (reviewer action). */
export function useUnapproveMetadataVersion(characterId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (versionId: number) =>
      api.post<MetadataVersion>(
        `/characters/${characterId}/metadata/versions/${versionId}/unapprove`,
        {},
      ),
    onSuccess: () => invalidateVersionsAndMetadata(queryClient, characterId),
  });
}

/** Reject a metadata version's approval (reviewer action). */
export function useRejectMetadataApproval(characterId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: { versionId: number; comment?: string }) =>
      api.post<MetadataVersion>(
        `/characters/${characterId}/metadata/versions/${data.versionId}/reject-approval`,
        { comment: data.comment },
      ),
    onSuccess: () => invalidateVersions(queryClient, characterId),
  });
}

/** Soft-delete a metadata version. */
export function useDeleteVersion(characterId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (versionId: number) =>
      api.delete(`/characters/${characterId}/metadata/versions/${versionId}`),
    onSuccess: () => invalidateVersions(queryClient, characterId),
  });
}
