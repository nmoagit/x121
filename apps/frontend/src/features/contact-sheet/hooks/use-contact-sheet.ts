/**
 * TanStack Query hooks for Avatar Face Contact Sheet (PRD-103).
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
  avatar: (avatarId: number) =>
    [...contactSheetKeys.all, "avatar", avatarId] as const,
  export: (avatarId: number, format: ExportFormat) =>
    [...contactSheetKeys.all, "export", avatarId, format] as const,
};

/* --------------------------------------------------------------------------
   Queries
   -------------------------------------------------------------------------- */

/** Fetches all contact sheet face-crop images for a avatar. */
export function useContactSheetImages(avatarId: number) {
  return useQuery({
    queryKey: contactSheetKeys.avatar(avatarId),
    queryFn: () =>
      api.get<ContactSheetImage[]>(`/avatars/${avatarId}/contact-sheet/images`),
    enabled: avatarId > 0,
  });
}

/** Exports the contact sheet in the specified format. Enabled only when explicitly triggered. */
export function useExportContactSheet(
  avatarId: number,
  format: ExportFormat,
  enabled: boolean,
) {
  return useQuery({
    queryKey: contactSheetKeys.export(avatarId, format),
    queryFn: () =>
      api.get<{ url: string }>(`/avatars/${avatarId}/contact-sheet/export?format=${format}`),
    enabled: enabled && avatarId > 0,
  });
}

/* --------------------------------------------------------------------------
   Mutations
   -------------------------------------------------------------------------- */

/** Creates a new face-crop image entry for a avatar's contact sheet. */
export function useCreateContactSheetImage(avatarId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateContactSheetImageInput) =>
      api.post<ContactSheetImage>(
        `/avatars/${avatarId}/contact-sheet/images`,
        input,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: contactSheetKeys.avatar(avatarId),
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

/** Generates face-crop extractions for all scenes of a avatar. */
export function useGenerateContactSheet(avatarId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () =>
      api.post<ContactSheetImage[]>(
        `/avatars/${avatarId}/contact-sheet/generate`,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: contactSheetKeys.avatar(avatarId),
      });
    },
  });
}
