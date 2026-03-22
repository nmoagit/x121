/**
 * TanStack Query hooks for avatar metadata versioning.
 *
 * Covers version CRUD, generation, activation, and rejection.
 */

import type { QueryClient } from "@tanstack/react-query";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type { MetadataVersion } from "../types";
import { avatarDetailKeys } from "./use-avatar-detail";

/* --------------------------------------------------------------------------
   Query key factory
   -------------------------------------------------------------------------- */

export const metadataVersionKeys = {
  list: (avatarId: number) =>
    ["avatars", avatarId, "metadata", "versions"] as const,
  detail: (avatarId: number, versionId: number) =>
    ["avatars", avatarId, "metadata", "versions", versionId] as const,
};

/* --------------------------------------------------------------------------
   Shared invalidation
   -------------------------------------------------------------------------- */

/** Invalidate version list and avatar metadata queries. */
function invalidateVersionsAndMetadata(qc: QueryClient, avatarId: number) {
  qc.invalidateQueries({ queryKey: metadataVersionKeys.list(avatarId) });
  qc.invalidateQueries({ queryKey: avatarDetailKeys.metadata(avatarId) });
}

/** Invalidate version list only. */
function invalidateVersions(qc: QueryClient, avatarId: number) {
  qc.invalidateQueries({ queryKey: metadataVersionKeys.list(avatarId) });
}

/* --------------------------------------------------------------------------
   Queries
   -------------------------------------------------------------------------- */

/** Fetch all metadata versions for a avatar. */
export function useMetadataVersions(avatarId: number) {
  return useQuery({
    queryKey: metadataVersionKeys.list(avatarId),
    queryFn: () =>
      api.get<MetadataVersion[]>(
        `/avatars/${avatarId}/metadata/versions`,
      ),
    enabled: avatarId > 0,
  });
}

/* --------------------------------------------------------------------------
   Mutations
   -------------------------------------------------------------------------- */

/** Generate metadata from bio/tov source files (backend transform). */
export function useGenerateMetadata(avatarId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: {
      bio_json?: Record<string, unknown> | null;
      tov_json?: Record<string, unknown> | null;
      activate?: boolean;
    }) =>
      api.post<MetadataVersion>(
        `/avatars/${avatarId}/metadata/versions/generate`,
        data,
      ),
    onSuccess: () => invalidateVersionsAndMetadata(queryClient, avatarId),
  });
}

/** Create a manual metadata version (or json_import / csv_import). */
export function useCreateManualVersion(avatarId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: {
      metadata: Record<string, unknown>;
      notes?: string;
      activate?: boolean;
      source?: string;
    }) =>
      api.post<MetadataVersion>(
        `/avatars/${avatarId}/metadata/versions`,
        data,
      ),
    onSuccess: () => invalidateVersionsAndMetadata(queryClient, avatarId),
  });
}

/** Activate a metadata version (syncs to avatars.metadata). */
export function useActivateVersion(avatarId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (versionId: number) =>
      api.put<MetadataVersion>(
        `/avatars/${avatarId}/metadata/versions/${versionId}/activate`,
        {},
      ),
    onSuccess: () => invalidateVersionsAndMetadata(queryClient, avatarId),
  });
}

/** Reject a metadata version with a reason. */
export function useRejectVersion(avatarId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: { versionId: number; reason: string }) =>
      api.put<MetadataVersion>(
        `/avatars/${avatarId}/metadata/versions/${data.versionId}/reject`,
        { reason: data.reason },
      ),
    onSuccess: () => invalidateVersions(queryClient, avatarId),
  });
}

/** Mark all active metadata versions as outdated (e.g. when Bio/ToV source files change). */
export function useMarkOutdated(avatarId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (reason: string) =>
      api.post(`/avatars/${avatarId}/metadata/mark-outdated`, { reason }),
    onSuccess: () => invalidateVersions(queryClient, avatarId),
  });
}

/** Approve a metadata version (reviewer action). */
export function useApproveMetadataVersion(avatarId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (versionId: number) =>
      api.post<MetadataVersion>(
        `/avatars/${avatarId}/metadata/versions/${versionId}/approve`,
        {},
      ),
    onSuccess: () => invalidateVersionsAndMetadata(queryClient, avatarId),
  });
}

/** Revert an approved/rejected metadata version back to pending (reviewer action). */
export function useUnapproveMetadataVersion(avatarId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (versionId: number) =>
      api.post<MetadataVersion>(
        `/avatars/${avatarId}/metadata/versions/${versionId}/unapprove`,
        {},
      ),
    onSuccess: () => invalidateVersionsAndMetadata(queryClient, avatarId),
  });
}

/** Reject a metadata version's approval (reviewer action). */
export function useRejectMetadataApproval(avatarId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: { versionId: number; comment?: string }) =>
      api.post<MetadataVersion>(
        `/avatars/${avatarId}/metadata/versions/${data.versionId}/reject-approval`,
        { comment: data.comment },
      ),
    onSuccess: () => invalidateVersions(queryClient, avatarId),
  });
}

/** Soft-delete a metadata version. */
export function useDeleteVersion(avatarId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (versionId: number) =>
      api.delete(`/avatars/${avatarId}/metadata/versions/${versionId}`),
    onSuccess: () => invalidateVersions(queryClient, avatarId),
  });
}
