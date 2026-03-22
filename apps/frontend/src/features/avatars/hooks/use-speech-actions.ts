/**
 * Aggregated speech mutation hooks for the speech tab (PRD-136).
 *
 * Reduces prop-drilling by packaging commonly-used speech mutations
 * into a single hook return value.
 */

import { useCallback, useState } from "react";

import { downloadJson } from "@/lib/file-utils";
import {
  useBulkApproveSpeeches,
  useCreateSpeech,
  useCreateSpeechType,
  useDeleteSpeech,
  useExportSpeeches,
  useGenerateDeliverable,
  useImportSpeeches,
  useReorderSpeeches,
  useUpdateSpeech,
  useUpdateSpeechStatus,
} from "./use-avatar-speeches";
import { SPEECH_STATUS_APPROVED, SPEECH_STATUS_REJECTED } from "../types";
import type { AvatarSpeech, ImportSpeechesResponse } from "../types";

export function useSpeechActions(avatarId: number) {
  const createSpeech = useCreateSpeech(avatarId);
  const updateSpeech = useUpdateSpeech(avatarId);
  const deleteSpeech = useDeleteSpeech(avatarId);
  const createSpeechType = useCreateSpeechType();
  const importSpeeches = useImportSpeeches(avatarId);
  const exportSpeeches = useExportSpeeches(avatarId);
  const updateStatus = useUpdateSpeechStatus(avatarId);
  const bulkApprove = useBulkApproveSpeeches(avatarId);
  const reorderSpeeches = useReorderSpeeches(avatarId);
  const generateDeliverable = useGenerateDeliverable(avatarId);

  /* --- inline editing state --- */
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<AvatarSpeech | null>(null);
  const [importResult, setImportResult] = useState<ImportSpeechesResponse | null>(null);

  function startEdit(speech: AvatarSpeech) {
    setEditingId(speech.id);
    setEditText(speech.text);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditText("");
  }

  function saveEdit() {
    if (editingId === null) return;
    updateSpeech.mutate({ speechId: editingId, text: editText }, { onSuccess: cancelEdit });
  }

  function confirmDelete() {
    if (!deleteTarget) return;
    deleteSpeech.mutate(deleteTarget.id, { onSuccess: () => setDeleteTarget(null) });
  }

  const handleApprove = useCallback(
    (speechId: number) => updateStatus.mutate({ speechId, status_id: SPEECH_STATUS_APPROVED }),
    [updateStatus],
  );

  const handleReject = useCallback(
    (speechId: number) => updateStatus.mutate({ speechId, status_id: SPEECH_STATUS_REJECTED }),
    [updateStatus],
  );

  const handleMoveUp = useCallback(
    (speech: AvatarSpeech, groupItems: AvatarSpeech[]) => {
      const idx = groupItems.findIndex((s) => s.id === speech.id);
      if (idx <= 0) return;
      const reordered = [...groupItems];
      const tmp = reordered[idx - 1]!;
      reordered[idx - 1] = reordered[idx]!;
      reordered[idx] = tmp;
      reorderSpeeches.mutate(reordered.map((s) => s.id));
    },
    [reorderSpeeches],
  );

  const handleMoveDown = useCallback(
    (speech: AvatarSpeech, groupItems: AvatarSpeech[]) => {
      const idx = groupItems.findIndex((s) => s.id === speech.id);
      if (idx < 0 || idx >= groupItems.length - 1) return;
      const reordered = [...groupItems];
      const tmp = reordered[idx]!;
      reordered[idx] = reordered[idx + 1]!;
      reordered[idx + 1] = tmp;
      reorderSpeeches.mutate(reordered.map((s) => s.id));
    },
    [reorderSpeeches],
  );

  const handleImport = useCallback(
    (input: { format: string; data: string; language_id?: number }) => {
      importSpeeches.mutate(
        { format: input.format, data: input.data },
        { onSuccess: (data) => setImportResult(data) },
      );
    },
    [importSpeeches],
  );

  function handleExport(format: string) {
    exportSpeeches.mutate(format, {
      onSuccess: (data) => {
        const blob = new Blob([data], {
          type: format === "json" ? "application/json" : "text/csv",
        });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `speeches.${format}`;
        a.click();
        URL.revokeObjectURL(a.href);
      },
    });
  }

  function handleBulkApprove(languageFilter: number | null) {
    bulkApprove.mutate(languageFilter ? { language_id: languageFilter } : undefined);
  }

  function handleGenerateDeliverable() {
    generateDeliverable.mutate(undefined, {
      onSuccess: (data) => downloadJson(data, `deliverable-${avatarId}.json`),
    });
  }

  return {
    // Mutations
    createSpeech,
    createSpeechType,
    importSpeeches,
    exportSpeeches,
    updateSpeech,
    deleteSpeech,
    bulkApprove,
    generateDeliverable,
    // Editing state
    editingId,
    editText,
    setEditText,
    startEdit,
    cancelEdit,
    saveEdit,
    // Delete state
    deleteTarget,
    setDeleteTarget,
    confirmDelete,
    // Import state
    importResult,
    setImportResult,
    // Actions
    handleApprove,
    handleReject,
    handleMoveUp,
    handleMoveDown,
    handleImport,
    handleExport,
    handleBulkApprove,
    handleGenerateDeliverable,
  };
}
