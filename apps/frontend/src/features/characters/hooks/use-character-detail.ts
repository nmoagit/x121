/**
 * TanStack Query hooks for character sub-resources (PRD-112).
 *
 * Covers settings and metadata endpoints.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type {
  ActiveTemplateResponse,
  CharacterMetadata,
  CharacterSettings,
} from "../types";

/* --------------------------------------------------------------------------
   Query key factory
   -------------------------------------------------------------------------- */

export const characterDetailKeys = {
  settings: (projectId: number, characterId: number) =>
    ["projects", projectId, "characters", characterId, "settings"] as const,
  metadata: (characterId: number) =>
    ["characters", characterId, "metadata"] as const,
  metadataTemplate: (characterId: number) =>
    ["characters", characterId, "metadata", "template"] as const,
};

/* --------------------------------------------------------------------------
   Settings hooks
   -------------------------------------------------------------------------- */

/** Fetch character settings. */
export function useCharacterSettings(projectId: number, characterId: number) {
  return useQuery({
    queryKey: characterDetailKeys.settings(projectId, characterId),
    queryFn: () =>
      api.get<CharacterSettings>(
        `/projects/${projectId}/characters/${characterId}/settings`,
      ),
    enabled: projectId > 0 && characterId > 0,
  });
}

/** Update character settings (partial merge). */
export function useUpdateCharacterSettings(
  projectId: number,
  characterId: number,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CharacterSettings) =>
      api.patch<CharacterSettings>(
        `/projects/${projectId}/characters/${characterId}/settings`,
        data,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: characterDetailKeys.settings(projectId, characterId),
      });
    },
  });
}

/* --------------------------------------------------------------------------
   Metadata hooks
   -------------------------------------------------------------------------- */

/** Fetch character metadata. */
export function useCharacterMetadata(characterId: number) {
  return useQuery({
    queryKey: characterDetailKeys.metadata(characterId),
    queryFn: () =>
      api.get<CharacterMetadata>(`/characters/${characterId}/metadata`),
    enabled: characterId > 0,
  });
}

/** Fetch active metadata template for a character. */
export function useMetadataTemplate(characterId: number) {
  return useQuery({
    queryKey: characterDetailKeys.metadataTemplate(characterId),
    queryFn: () =>
      api.get<ActiveTemplateResponse>(
        `/characters/${characterId}/metadata/template`,
      ),
    enabled: characterId > 0,
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
}

/** Approve all unapproved deliverables for a character in one call. */
export function useBulkApprove(projectId: number, characterId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () =>
      api.post<BulkApproveResult>(
        `/projects/${projectId}/characters/${characterId}/bulk-approve`,
        {},
      ),
    onSuccess: () => {
      // Broad invalidation to refresh all dependent views
      queryClient.invalidateQueries({ queryKey: ["characters", characterId] });
      queryClient.invalidateQueries({ queryKey: ["character-dashboard", characterId] });
      queryClient.invalidateQueries({ queryKey: ["projects", projectId] });
      queryClient.invalidateQueries({ queryKey: ["imageVariants"] });
      queryClient.invalidateQueries({ queryKey: ["scenes"] });
    },
  });
}

/** Replace character metadata. */
export function useUpdateCharacterMetadata(characterId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CharacterMetadata) =>
      api.put<CharacterMetadata>(
        `/characters/${characterId}/metadata`,
        data,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: characterDetailKeys.metadata(characterId),
      });
      // Also refresh the version list so new/deduped versions appear immediately.
      queryClient.invalidateQueries({
        queryKey: ["characters", characterId, "metadata", "versions"],
      });
      // Refresh character lists so components reading character.metadata see
      // the updated source keys (e.g. _source_bio, _source_tov).
      queryClient.invalidateQueries({
        predicate: (query) =>
          Array.isArray(query.queryKey) &&
          query.queryKey.includes("characters") &&
          query.queryKey.includes("list"),
      });
    },
  });
}
