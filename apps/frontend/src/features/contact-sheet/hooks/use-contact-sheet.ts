/**
 * TanStack Query hooks for Character Face Contact Sheet (PRD-103).
 *
 * Follows the key factory pattern used throughout the codebase.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type { ContactSheetImage, CreateContactSheetImageInput, ExportFormat } from "../types";

/* --------------------------------------------------------------------------
   Query keys
   -------------------------------------------------------------------------- */

export const contactSheetKeys = {
  all: ["contact-sheet"] as const,
  character: (characterId: number) =>
    [...contactSheetKeys.all, "character", characterId] as const,
  export: (characterId: number, format: ExportFormat) =>
    [...contactSheetKeys.all, "export", characterId, format] as const,
};

/* --------------------------------------------------------------------------
   Queries
   -------------------------------------------------------------------------- */

/** Fetches all contact sheet face-crop images for a character. */
export function useContactSheetImages(characterId: number) {
  return useQuery({
    queryKey: contactSheetKeys.character(characterId),
    queryFn: () =>
      api.get<ContactSheetImage[]>(`/characters/${characterId}/contact-sheet/images`),
    enabled: characterId > 0,
  });
}

/** Exports the contact sheet in the specified format. Enabled only when explicitly triggered. */
export function useExportContactSheet(
  characterId: number,
  format: ExportFormat,
  enabled: boolean,
) {
  return useQuery({
    queryKey: contactSheetKeys.export(characterId, format),
    queryFn: () =>
      api.get<{ url: string }>(`/characters/${characterId}/contact-sheet/export?format=${format}`),
    enabled: enabled && characterId > 0,
  });
}

/* --------------------------------------------------------------------------
   Mutations
   -------------------------------------------------------------------------- */

/** Creates a new face-crop image entry for a character's contact sheet. */
export function useCreateContactSheetImage(characterId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateContactSheetImageInput) =>
      api.post<ContactSheetImage>(
        `/characters/${characterId}/contact-sheet/images`,
        input,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: contactSheetKeys.character(characterId),
      });
    },
  });
}

/** Deletes a face-crop image from the contact sheet. */
export function useDeleteContactSheetImage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (imageId: number) =>
      api.delete(`/contact-sheet/images/${imageId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: contactSheetKeys.all,
      });
    },
  });
}

/** Generates face-crop extractions for all scenes of a character. */
export function useGenerateContactSheet(characterId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () =>
      api.post<ContactSheetImage[]>(
        `/characters/${characterId}/contact-sheet/generate`,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: contactSheetKeys.character(characterId),
      });
    },
  });
}
