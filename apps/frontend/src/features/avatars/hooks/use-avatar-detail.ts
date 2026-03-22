/**
 * TanStack Query hooks for avatar sub-resources (PRD-112).
 *
 * Covers settings and metadata endpoints.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type {
  ActiveTemplateResponse,
  AvatarMetadata,
  AvatarSettings,
} from "../types";

/* --------------------------------------------------------------------------
   Query key factory
   -------------------------------------------------------------------------- */

export const avatarDetailKeys = {
  settings: (projectId: number, avatarId: number) =>
    ["projects", projectId, "avatars", avatarId, "settings"] as const,
  metadata: (avatarId: number) =>
    ["avatars", avatarId, "metadata"] as const,
  metadataTemplate: (avatarId: number) =>
    ["avatars", avatarId, "metadata", "template"] as const,
};

/* --------------------------------------------------------------------------
   Settings hooks
   -------------------------------------------------------------------------- */

/** Fetch avatar settings. */
export function useAvatarSettings(projectId: number, avatarId: number) {
  return useQuery({
    queryKey: avatarDetailKeys.settings(projectId, avatarId),
    queryFn: () =>
      api.get<AvatarSettings>(
        `/projects/${projectId}/avatars/${avatarId}/settings`,
      ),
    enabled: projectId > 0 && avatarId > 0,
  });
}

/** Update avatar settings (partial merge). */
export function useUpdateAvatarSettings(
  projectId: number,
  avatarId: number,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: AvatarSettings) =>
      api.patch<AvatarSettings>(
        `/projects/${projectId}/avatars/${avatarId}/settings`,
        data,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: avatarDetailKeys.settings(projectId, avatarId),
      });
    },
  });
}

/* --------------------------------------------------------------------------
   Metadata hooks
   -------------------------------------------------------------------------- */

/** Fetch avatar metadata. */
export function useAvatarMetadata(avatarId: number) {
  return useQuery({
    queryKey: avatarDetailKeys.metadata(avatarId),
    queryFn: () =>
      api.get<AvatarMetadata>(`/avatars/${avatarId}/metadata`),
    enabled: avatarId > 0,
  });
}

/** Fetch active metadata template for a avatar. */
export function useMetadataTemplate(avatarId: number) {
  return useQuery({
    queryKey: avatarDetailKeys.metadataTemplate(avatarId),
    queryFn: () =>
      api.get<ActiveTemplateResponse>(
        `/avatars/${avatarId}/metadata/template`,
      ),
    enabled: avatarId > 0,
  });
}

/* --------------------------------------------------------------------------
   Bulk approve
   -------------------------------------------------------------------------- */

/** Result from the bulk-approve endpoint. */
export interface BulkApproveResult {
  images_approved: number;
  clips_approved: number;
  metadata_approved: number;
  skipped_sections: string[];
}

/** Approve deliverables for a avatar, scoped to the given sections. */
export function useBulkApprove(projectId: number, avatarId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (sections?: string[]) =>
      api.post<BulkApproveResult>(
        `/projects/${projectId}/avatars/${avatarId}/bulk-approve`,
        { sections: sections ?? null },
      ),
    onSuccess: () => {
      // Broad invalidation to refresh all dependent views
      queryClient.invalidateQueries({ queryKey: ["avatars", avatarId] });
      queryClient.invalidateQueries({ queryKey: ["avatar-dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["projects", projectId] });
      queryClient.invalidateQueries({ queryKey: ["imageVariants"] });
      queryClient.invalidateQueries({ queryKey: ["scenes"] });
      queryClient.invalidateQueries({
        predicate: (q) => Array.isArray(q.queryKey) && q.queryKey.includes("avatars") && q.queryKey.includes("list"),
      });
      queryClient.invalidateQueries({ queryKey: avatarDetailKeys.metadata(avatarId) });
    },
  });
}

/** Replace avatar metadata. */
export function useUpdateAvatarMetadata(avatarId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: AvatarMetadata) =>
      api.put<AvatarMetadata>(
        `/avatars/${avatarId}/metadata`,
        data,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: avatarDetailKeys.metadata(avatarId),
      });
      // Also refresh the version list so new/deduped versions appear immediately.
      queryClient.invalidateQueries({
        queryKey: ["avatars", avatarId, "metadata", "versions"],
      });
      // Refresh avatar lists so components reading avatar.metadata see
      // the updated source keys (e.g. _source_bio, _source_tov).
      queryClient.invalidateQueries({
        predicate: (query) =>
          Array.isArray(query.queryKey) &&
          query.queryKey.includes("avatars") &&
          query.queryKey.includes("list"),
      });
    },
  });
}
