/**
 * TanStack Query hooks for character face embedding management (PRD-76).
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
  status: (characterId: number) =>
    [...embeddingKeys.statuses(), characterId] as const,
  faces: () => [...embeddingKeys.all, "faces"] as const,
  faceList: (characterId: number) =>
    [...embeddingKeys.faces(), characterId] as const,
  histories: () => [...embeddingKeys.all, "history"] as const,
  history: (characterId: number) =>
    [...embeddingKeys.histories(), characterId] as const,
};

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

function embeddingBasePath(characterId: number): string {
  return `/characters/${characterId}`;
}

/* --------------------------------------------------------------------------
   Query hooks
   -------------------------------------------------------------------------- */

/** Fetch the current embedding status for a character. */
export function useEmbeddingStatus(characterId: number) {
  return useQuery({
    queryKey: embeddingKeys.status(characterId),
    queryFn: () =>
      api.get<EmbeddingStatusResponse>(
        `${embeddingBasePath(characterId)}/embedding-status`,
      ),
    enabled: characterId > 0,
  });
}

/** Fetch detected faces for a character (multi-face scenario). */
export function useDetectedFaces(characterId: number) {
  return useQuery({
    queryKey: embeddingKeys.faceList(characterId),
    queryFn: () =>
      api.get<DetectedFace[]>(
        `${embeddingBasePath(characterId)}/detected-faces`,
      ),
    enabled: characterId > 0,
  });
}

/** Fetch the embedding replacement history for a character. */
export function useEmbeddingHistory(characterId: number) {
  return useQuery({
    queryKey: embeddingKeys.history(characterId),
    queryFn: () =>
      api.get<EmbeddingHistory[]>(
        `${embeddingBasePath(characterId)}/embedding-history`,
      ),
    enabled: characterId > 0,
  });
}

/* --------------------------------------------------------------------------
   Mutation hooks
   -------------------------------------------------------------------------- */

/** Trigger face embedding extraction for a character. */
export function useExtractEmbedding(characterId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data?: ExtractEmbeddingRequest) =>
      api.post<EmbeddingStatusResponse>(
        `${embeddingBasePath(characterId)}/extract-embedding`,
        data,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: embeddingKeys.status(characterId),
      });
      queryClient.invalidateQueries({
        queryKey: embeddingKeys.faceList(characterId),
      });
    },
  });
}

/** Select a detected face as the primary face for a character. */
export function useSelectFace(characterId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: SelectFaceRequest) =>
      api.post<EmbeddingStatusResponse>(
        `${embeddingBasePath(characterId)}/select-face`,
        data,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: embeddingKeys.status(characterId),
      });
      queryClient.invalidateQueries({
        queryKey: embeddingKeys.faceList(characterId),
      });
      queryClient.invalidateQueries({
        queryKey: embeddingKeys.history(characterId),
      });
    },
  });
}
