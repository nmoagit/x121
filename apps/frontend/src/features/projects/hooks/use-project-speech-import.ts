/**
 * TanStack Query hooks for bulk speech import and deliverable generation (PRD-136).
 */

import { useMutation } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type { BulkImportReport } from "@/features/characters/types";

/* --------------------------------------------------------------------------
   Bulk import
   -------------------------------------------------------------------------- */

export function useBulkImportSpeeches(projectId: number) {
  return useMutation({
    mutationFn: (input: { format: string; data: string; default_language_id?: number }) =>
      api.post<BulkImportReport>(`/projects/${projectId}/speeches/import`, input),
  });
}

/* --------------------------------------------------------------------------
   Bulk deliverable (zip download)
   -------------------------------------------------------------------------- */

export function useBulkGenerateDeliverables(projectId: number) {
  return useMutation({
    mutationFn: async () => {
      const response = await api.raw(`/projects/${projectId}/speech-deliverables`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      return response.blob();
    },
  });
}
