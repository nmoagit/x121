/**
 * TanStack Query hooks for the folder-to-entity bulk importer (PRD-016).
 *
 * Follows the key factory pattern used throughout the codebase.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type {
  FolderImportPreview,
  ImportCommitResult,
  ImportSession,
  UploadResponse,
} from "../types";

/* --------------------------------------------------------------------------
   Query keys
   -------------------------------------------------------------------------- */

export const importerKeys = {
  all: ["importer"] as const,
  session: (id: number) => [...importerKeys.all, "session", id] as const,
  preview: (id: number) => [...importerKeys.all, "preview", id] as const,
};

/* --------------------------------------------------------------------------
   Session hooks
   -------------------------------------------------------------------------- */

/** Fetch an import session by ID. */
export function useImportSession(sessionId: number | null) {
  return useQuery({
    queryKey: importerKeys.session(sessionId ?? 0),
    queryFn: () => api.get<ImportSession>(`/import/${sessionId}`),
    enabled: sessionId !== null,
  });
}

/* --------------------------------------------------------------------------
   Upload hook
   -------------------------------------------------------------------------- */

interface UploadFolderParams {
  projectId: number;
  sourceName?: string;
  files: File[];
}

/** Upload a folder of files to create an import session. */
export function useUploadFolder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      projectId,
      sourceName,
      files,
    }: UploadFolderParams): Promise<UploadResponse> => {
      const formData = new FormData();
      for (const file of files) {
        // Use webkitRelativePath to preserve folder structure, falling
        // back to the file name if unavailable.
        const path =
          (file as File & { webkitRelativePath?: string })
            .webkitRelativePath || file.name;
        formData.append("files", file, path);
      }

      const nameParam = sourceName
        ? `&source_name=${encodeURIComponent(sourceName)}`
        : "";

      const response = await api.raw(
        `/import/folder?project_id=${projectId}${nameParam}`,
        { method: "POST", body: formData },
      );

      const body = await response.json();
      return body.data as UploadResponse;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: importerKeys.all });
    },
  });
}

/* --------------------------------------------------------------------------
   Preview hook
   -------------------------------------------------------------------------- */

/** Fetch the import preview for a session. */
export function useImportPreview(sessionId: number | null) {
  return useQuery({
    queryKey: importerKeys.preview(sessionId ?? 0),
    queryFn: () =>
      api.get<FolderImportPreview>(`/import/${sessionId}/preview`),
    enabled: sessionId !== null,
  });
}

/* --------------------------------------------------------------------------
   Commit hook
   -------------------------------------------------------------------------- */

interface CommitParams {
  sessionId: number;
  deselectedEntryIds?: number[];
}

/** Commit an import session. */
export function useCommitImport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ sessionId, deselectedEntryIds = [] }: CommitParams) =>
      api.post<ImportCommitResult>(`/import/${sessionId}/commit`, {
        deselected_entry_ids: deselectedEntryIds,
      }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: importerKeys.session(variables.sessionId),
      });
    },
  });
}

/* --------------------------------------------------------------------------
   Cancel hook
   -------------------------------------------------------------------------- */

/** Cancel an import session. */
export function useCancelImport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (sessionId: number) =>
      api.post<void>(`/import/${sessionId}/cancel`),
    onSuccess: (_data, sessionId) => {
      queryClient.invalidateQueries({
        queryKey: importerKeys.session(sessionId),
      });
    },
  });
}
