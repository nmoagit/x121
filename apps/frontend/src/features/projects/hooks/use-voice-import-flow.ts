/**
 * Shared voice import flow hook for bulk voice ID CSV imports.
 *
 * Manages voice import state, preview, and confirmation across
 * ProjectOverviewTab, ProjectCharactersTab, and CharactersPage.
 */

import { useCallback, useState } from "react";

import type { VoiceIdEntry } from "@/components/domain/FileDropZone";

import { useBulkVoiceImport } from "./use-project-speech-import";
import type { BulkVoiceImportResult, VoiceImportMode } from "./use-project-speech-import";
import type { Character } from "../types";

export function useVoiceImportFlow(projectId: number, characters: Character[]) {
  const bulkVoiceImport = useBulkVoiceImport(projectId);
  const [voiceImport, setVoiceImport] = useState<VoiceIdEntry[] | null>(null);
  const [voiceImportResult, setVoiceImportResult] = useState<BulkVoiceImportResult | null>(null);
  const [voiceImportMode, setVoiceImportMode] = useState<VoiceImportMode>("new_only");

  const handleVoiceFileDrop = useCallback((entries: VoiceIdEntry[]) => {
    setVoiceImport(entries);
    setVoiceImportResult(null);
  }, []);

  function handleVoiceImportConfirm() {
    if (!voiceImport) return;
    bulkVoiceImport.mutate(
      { entries: voiceImport, characters, mode: voiceImportMode },
      {
        onSuccess: (result) => {
          setVoiceImportResult(result);
          setVoiceImport(null);
        },
      },
    );
  }

  return {
    voiceImport,
    voiceImportResult,
    voiceImportMode,
    setVoiceImportMode,
    bulkVoiceImport,
    handleVoiceFileDrop,
    handleVoiceImportConfirm,
    setVoiceImport,
    setVoiceImportResult,
  };
}
