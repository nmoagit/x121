/**
 * Shared orchestration hook for the scan → confirm → SSE-import flow
 * (PRD-165).
 *
 * Used by the Project Avatars tab, Scenes page, Derived Clips page, and
 * Media page so each page renders the same dialogs with the same state
 * machine. The page owns the trigger button; everything else lives here.
 *
 * State machine:
 *   closed → scan-open (user types path) → confirm-open (mapped payloads)
 *          → importing (SSE stream) → closed (on completion / cancel)
 */

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";

import { mapScanToPayloads } from "@/features/projects/lib/scan-to-payload";
import type { AvatarDropPayload, ImportHashSummary } from "@/features/projects/types";
import type { ScanResponse } from "./useDirectoryScan";
import { type ImportDoneSummary, useServerImport } from "./useServerImport";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface UseScanImportFlowOptions {
  pipelineId: number;
  projectId: number;
  /** Called after a successful import completes. */
  onCompleted?: (summary: ImportDoneSummary) => void;
}

export interface ScanImportFlow {
  // Dialog state
  scanOpen: boolean;
  openScan: () => void;
  closeScan: () => void;

  confirmOpen: boolean;
  confirmPayloads: AvatarDropPayload[] | null;
  hashSummary: ImportHashSummary | null;
  closeConfirm: () => void;

  // Hand-off callbacks to render in the page
  handleScanSuccess: (scan: ScanResponse) => void;
  handleConfirm: (
    newPayloads: AvatarDropPayload[],
    existingPayloads: AvatarDropPayload[],
    groupId?: number,
    overwrite?: boolean,
    skipExisting?: boolean,
    applyFilenameTags?: boolean,
  ) => void;

  // Import state for ImportProgressBar / summary rendering
  importProgress: ReturnType<typeof useServerImport>["progress"];
  importSummary: ImportDoneSummary | null;
  isImporting: boolean;
  cancelImport: () => void;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useScanImportFlow(options: UseScanImportFlowOptions): ScanImportFlow {
  const { pipelineId, projectId, onCompleted } = options;
  const queryClient = useQueryClient();

  const [scanOpen, setScanOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmPayloads, setConfirmPayloads] = useState<AvatarDropPayload[] | null>(null);
  const [hashSummary, setHashSummary] = useState<ImportHashSummary | null>(null);

  const serverImport = useServerImport({
    pipelineId,
    projectId,
    onComplete: (summary) => {
      // Invalidate everything — avatars, scenes, media, tags — since any
      // combination may have been touched. This matches the coarse-grained
      // invalidation the legacy /directory-scan/import flow does.
      queryClient.invalidateQueries();
      onCompleted?.(summary);
    },
  });

  const openScan = useCallback(() => setScanOpen(true), []);

  const closeScan = useCallback(() => setScanOpen(false), []);

  const closeConfirm = useCallback(() => {
    setConfirmOpen(false);
    setConfirmPayloads(null);
    setHashSummary(null);
  }, []);

  const handleScanSuccess = useCallback((scan: ScanResponse) => {
    const { payloads, hashSummary: summary } = mapScanToPayloads(scan);
    setConfirmPayloads(payloads);
    setHashSummary(summary);
    setScanOpen(false);
    setConfirmOpen(true);
  }, []);

  const handleConfirm = useCallback(
    (
      newPayloads: AvatarDropPayload[],
      existingPayloads: AvatarDropPayload[],
      groupId?: number,
      overwrite?: boolean,
      skipExisting?: boolean,
      applyFilenameTags?: boolean,
    ) => {
      // Keep the confirm modal open so the progress bar can render inside it.
      void serverImport.startImport({
        newPayloads,
        existingPayloads,
        groupId,
        overwrite,
        skipExisting,
        applyFilenameTags,
      });
    },
    [serverImport],
  );

  return {
    scanOpen,
    openScan,
    closeScan,
    confirmOpen,
    confirmPayloads,
    hashSummary,
    closeConfirm,
    handleScanSuccess,
    handleConfirm,
    importProgress: serverImport.progress,
    importSummary: serverImport.summary,
    isImporting: serverImport.isImporting,
    cancelImport: serverImport.cancelImport,
  };
}
