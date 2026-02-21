/**
 * TanStack Query hooks for character metadata editing (PRD-66).
 *
 * Follows the key factory pattern used throughout the codebase.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type {
  CharacterMetadataResponse,
  CompletenessResult,
  CsvImportPreview,
  MetadataUpdateResult,
  MetadataValidationFailure,
  ProjectCompleteness,
} from "../types";

/* --------------------------------------------------------------------------
   Query keys
   -------------------------------------------------------------------------- */

export const metadataEditorKeys = {
  all: ["metadata-editor"] as const,
  character: (characterId: number) =>
    [...metadataEditorKeys.all, "character", characterId] as const,
  completeness: (characterId: number) =>
    [...metadataEditorKeys.all, "completeness", characterId] as const,
  project: (projectId: number) =>
    [...metadataEditorKeys.all, "project", projectId] as const,
  projectCompleteness: (projectId: number) =>
    [...metadataEditorKeys.all, "project-completeness", projectId] as const,
};

/* --------------------------------------------------------------------------
   Character metadata hooks
   -------------------------------------------------------------------------- */

/** Fetch structured metadata for a single character. */
export function useCharacterMetadata(characterId: number) {
  return useQuery({
    queryKey: metadataEditorKeys.character(characterId),
    queryFn: () =>
      api.get<CharacterMetadataResponse>(
        `/characters/${characterId}/metadata`,
      ),
    enabled: characterId > 0,
  });
}

/** Fetch completeness for a single character. */
export function useCharacterCompleteness(characterId: number) {
  return useQuery({
    queryKey: metadataEditorKeys.completeness(characterId),
    queryFn: () =>
      api.get<CompletenessResult>(
        `/characters/${characterId}/metadata/completeness`,
      ),
    enabled: characterId > 0,
  });
}

/** Update character metadata fields. */
export function useUpdateCharacterMetadata(characterId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (updates: Record<string, unknown>) =>
      api.put<MetadataUpdateResult | MetadataValidationFailure>(
        `/characters/${characterId}/metadata`,
        updates,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: metadataEditorKeys.character(characterId),
      });
      queryClient.invalidateQueries({
        queryKey: metadataEditorKeys.completeness(characterId),
      });
    },
  });
}

/* --------------------------------------------------------------------------
   Project metadata hooks
   -------------------------------------------------------------------------- */

/** Fetch metadata for all characters in a project (spreadsheet view). */
export function useProjectMetadata(projectId: number) {
  return useQuery({
    queryKey: metadataEditorKeys.project(projectId),
    queryFn: () =>
      api.get<CharacterMetadataResponse[]>(
        `/projects/${projectId}/characters/metadata`,
      ),
    enabled: projectId > 0,
  });
}

/** Fetch project-level completeness summary. */
export function useProjectCompleteness(projectId: number) {
  return useQuery({
    queryKey: metadataEditorKeys.projectCompleteness(projectId),
    queryFn: () =>
      api.get<ProjectCompleteness>(
        `/projects/${projectId}/characters/metadata/completeness`,
      ),
    enabled: projectId > 0,
  });
}

/* --------------------------------------------------------------------------
   CSV export helper
   -------------------------------------------------------------------------- */

/** Trigger a CSV download for all character metadata in a project. */
export async function exportMetadataCsv(projectId: number): Promise<void> {
  const response = await api.raw(
    `/projects/${projectId}/characters/metadata/csv`,
  );

  const blob = await response.blob();
  const downloadUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = downloadUrl;
  a.download = "metadata.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(downloadUrl);
}

/* --------------------------------------------------------------------------
   CSV import hook
   -------------------------------------------------------------------------- */

/** Upload a CSV file and return a diff preview. */
export function useImportMetadataCsv(projectId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (file: File): Promise<CsvImportPreview> => {
      const response = await api.raw(
        `/projects/${projectId}/characters/metadata/csv`,
        {
          method: "POST",
          headers: { "Content-Type": "text/csv" },
          body: await file.text(),
        },
      );

      const body = await response.json();
      return body.data as CsvImportPreview;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: metadataEditorKeys.project(projectId),
      });
    },
  });
}
