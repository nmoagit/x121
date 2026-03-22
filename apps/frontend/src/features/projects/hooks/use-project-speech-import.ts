/**
 * TanStack Query hooks for bulk speech import, voice import, and deliverable generation (PRD-136).
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import { generateSnakeSlug } from "@/lib/format";
import type { VoiceIdEntry } from "@/components/domain/FileDropZone";
import { SETTING_KEY_VOICE } from "@/features/avatars/types";
import type { BulkImportReport } from "@/features/avatars/types";
import type { Avatar } from "../types";
import { deliverableKeys } from "./use-avatar-deliverables";

/* --------------------------------------------------------------------------
   Bulk import
   -------------------------------------------------------------------------- */

export function useBulkImportSpeeches(projectId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { format: string; data: string; default_language_id?: number; skip_existing?: boolean }) =>
      api.post<BulkImportReport>(`/projects/${projectId}/speeches/import`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: deliverableKeys.speechLanguageCounts(projectId) });
      // Also invalidate per-avatar speech queries
      qc.invalidateQueries({ predicate: (q) => Array.isArray(q.queryKey) && q.queryKey.includes("speeches") });
    },
  });
}

/* --------------------------------------------------------------------------
   Bulk voice ID import
   -------------------------------------------------------------------------- */

export type VoiceImportMode = "new_only" | "overwrite";

export interface BulkVoiceImportResult {
  updated: string[];
  skipped: string[];
  unmatched: string[];
  errors: string[];
}

export function useBulkVoiceImport(projectId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { entries: VoiceIdEntry[]; avatars: Avatar[]; mode: VoiceImportMode }): Promise<BulkVoiceImportResult> => {
      const result: BulkVoiceImportResult = { updated: [], skipped: [], unmatched: [], errors: [] };
      const charMap = new Map(input.avatars.map((c) => [generateSnakeSlug(c.name), c]));

      for (const entry of input.entries) {
        const char = charMap.get(generateSnakeSlug(entry.slug));
        if (!char) {
          result.unmatched.push(entry.slug);
          continue;
        }
        // In new_only mode, skip avatars that already have a voice ID
        if (input.mode === "new_only") {
          const existing = char.settings?.[SETTING_KEY_VOICE];
          if (typeof existing === "string" && existing.length > 0) {
            result.skipped.push(char.name);
            continue;
          }
        }
        try {
          await api.patch(`/projects/${projectId}/avatars/${char.id}/settings`, {
            [SETTING_KEY_VOICE]: entry.voice_id,
          });
          result.updated.push(char.name);
        } catch (e) {
          result.errors.push(`${char.name}: ${e instanceof Error ? e.message : "unknown error"}`);
        }
      }

      return result;
    },
    onSuccess: () => {
      qc.invalidateQueries({
        predicate: (q) => Array.isArray(q.queryKey) && q.queryKey.includes("avatars"),
      });
    },
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
