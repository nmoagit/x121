/**
 * TanStack Query hooks for avatar metadata editing (PRD-66).
 *
 * Follows the key factory pattern used throughout the codebase.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type {
  AvatarMetadataResponse,
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
  avatar: (avatarId: number) =>
    [...metadataEditorKeys.all, "avatar", avatarId] as const,
  completeness: (avatarId: number) =>
    [...metadataEditorKeys.all, "completeness", avatarId] as const,
  project: (projectId: number) =>
    [...metadataEditorKeys.all, "project", projectId] as const,
  projectCompleteness: (projectId: number) =>
    [...metadataEditorKeys.all, "project-completeness", projectId] as const,
};

/* --------------------------------------------------------------------------
   Avatar metadata hooks
   -------------------------------------------------------------------------- */

/** Fetch structured metadata for a single avatar. */
export function useAvatarMetadata(avatarId: number) {
  return useQuery({
    queryKey: metadataEditorKeys.avatar(avatarId),
    queryFn: () =>
      api.get<AvatarMetadataResponse>(
        `/avatars/${avatarId}/metadata`,
      ),
    enabled: avatarId > 0,
  });
}

/** Fetch completeness for a single avatar. */
export function useAvatarCompleteness(avatarId: number) {
  return useQuery({
    queryKey: metadataEditorKeys.completeness(avatarId),
    queryFn: () =>
      api.get<CompletenessResult>(
        `/avatars/${avatarId}/metadata/completeness`,
      ),
    enabled: avatarId > 0,
  });
}

/** Update avatar metadata fields. */
export function useUpdateAvatarMetadata(avatarId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (updates: Record<string, unknown>) =>
      api.put<MetadataUpdateResult | MetadataValidationFailure>(
        `/avatars/${avatarId}/metadata`,
        updates,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: metadataEditorKeys.avatar(avatarId),
      });
      queryClient.invalidateQueries({
        queryKey: metadataEditorKeys.completeness(avatarId),
      });
    },
  });
}

/* --------------------------------------------------------------------------
   Project metadata hooks
   -------------------------------------------------------------------------- */

/** Fetch metadata for all avatars in a project (spreadsheet view). */
export function useProjectMetadata(projectId: number) {
  return useQuery({
    queryKey: metadataEditorKeys.project(projectId),
    queryFn: () =>
      api.get<AvatarMetadataResponse[]>(
        `/projects/${projectId}/avatars/metadata`,
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
        `/projects/${projectId}/avatars/metadata/completeness`,
      ),
    enabled: projectId > 0,
  });
}

/* --------------------------------------------------------------------------
   CSV export helper
   -------------------------------------------------------------------------- */

/** Trigger a CSV download for all avatar metadata in a project. */
export async function exportMetadataCsv(projectId: number): Promise<void> {
  const response = await api.raw(
    `/projects/${projectId}/avatars/metadata/csv`,
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
        `/projects/${projectId}/avatars/metadata/csv`,
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
