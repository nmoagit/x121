/**
 * TanStack Query hooks for avatar face embedding management (PRD-76).
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type {
  DetectedFace,
  EmbeddingHistory,
  EmbeddingStatusResponse,
  ExtractEmbeddingRequest,
  SelectFaceRequest,
} from "../types";

/* --------------------------------------------------------------------------
   Query key factory
   -------------------------------------------------------------------------- */

export const embeddingKeys = {
  all: ["embedding"] as const,
  statuses: () => [...embeddingKeys.all, "status"] as const,
  status: (avatarId: number) =>
    [...embeddingKeys.statuses(), avatarId] as const,
  faces: () => [...embeddingKeys.all, "faces"] as const,
  faceList: (avatarId: number) =>
    [...embeddingKeys.faces(), avatarId] as const,
  histories: () => [...embeddingKeys.all, "history"] as const,
  history: (avatarId: number) =>
    [...embeddingKeys.histories(), avatarId] as const,
};

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

function embeddingBasePath(avatarId: number): string {
  return `/avatars/${avatarId}`;
}

/* --------------------------------------------------------------------------
   Query hooks
   -------------------------------------------------------------------------- */

/** Fetch the current embedding status for a avatar. */
export function useEmbeddingStatus(avatarId: number) {
  return useQuery({
    queryKey: embeddingKeys.status(avatarId),
    queryFn: () =>
      api.get<EmbeddingStatusResponse>(
        `${embeddingBasePath(avatarId)}/embedding-status`,
      ),
    enabled: avatarId > 0,
  });
}

/** Fetch detected faces for a avatar (multi-face scenario). */
export function useDetectedFaces(avatarId: number) {
  return useQuery({
    queryKey: embeddingKeys.faceList(avatarId),
    queryFn: () =>
      api.get<DetectedFace[]>(
        `${embeddingBasePath(avatarId)}/detected-faces`,
      ),
    enabled: avatarId > 0,
  });
}

/** Fetch the embedding replacement history for a avatar. */
export function useEmbeddingHistory(avatarId: number) {
  return useQuery({
    queryKey: embeddingKeys.history(avatarId),
    queryFn: () =>
      api.get<EmbeddingHistory[]>(
        `${embeddingBasePath(avatarId)}/embedding-history`,
      ),
    enabled: avatarId > 0,
  });
}

/* --------------------------------------------------------------------------
   Mutation hooks
   -------------------------------------------------------------------------- */

/** Trigger face embedding extraction for a avatar. */
export function useExtractEmbedding(avatarId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data?: ExtractEmbeddingRequest) =>
      api.post<EmbeddingStatusResponse>(
        `${embeddingBasePath(avatarId)}/extract-embedding`,
        data,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: embeddingKeys.status(avatarId),
      });
      queryClient.invalidateQueries({
        queryKey: embeddingKeys.faceList(avatarId),
      });
    },
  });
}

/** Select a detected face as the primary face for a avatar. */
export function useSelectFace(avatarId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: SelectFaceRequest) =>
      api.post<EmbeddingStatusResponse>(
        `${embeddingBasePath(avatarId)}/select-face`,
        data,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: embeddingKeys.status(avatarId),
      });
      queryClient.invalidateQueries({
        queryKey: embeddingKeys.faceList(avatarId),
      });
      queryClient.invalidateQueries({
        queryKey: embeddingKeys.history(avatarId),
      });
    },
  });
}
