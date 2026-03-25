/**
 * Shared hook for bulk operations on browse pages (PRD-151).
 *
 * Encapsulates dialog state, export state, and all handler callbacks for
 * bulk approve, reject, label, and export operations. Used by both
 * ScenesPage and MediaPage to eliminate ~130 lines of duplication.
 */

import { useState, useCallback } from "react";
import type { UseMutationResult } from "@tanstack/react-query";

import { api } from "@/lib/api";
import { useToast } from "@/components/composite/useToast";
import { useCreateExport, useExportStatus } from "@/features/exports/hooks/use-exports";
import type { ExportJob, CreateExportInput } from "@/features/exports/hooks/use-exports";
import type { BulkSelection } from "./useBulkSelection";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface BulkActionResult {
  updated: number;
}

interface UseBulkOperationsConfig {
  /** "scene_video_version" or "media_variant" */
  entityType: CreateExportInput["entity_type"];
  /** Display noun for toasts ("clip" or "variant") */
  entityNoun: string;
  /** The bulk selection hook instance */
  bulk: BulkSelection;
  /** Total count of items matching current filters */
  total: number;
  /** Builds the filter snapshot for selectAllMatching mode */
  buildFilters: () => Record<string, unknown>;
  /** Bulk approve mutation */
  approveMut: UseMutationResult<BulkActionResult, unknown, Record<string, unknown>>;
  /** Bulk reject mutation */
  rejectMut: UseMutationResult<BulkActionResult, unknown, Record<string, unknown>>;
}

export interface BulkOperations {
  /** Dialog open state for reject */
  rejectDialogOpen: boolean;
  setRejectDialogOpen: (open: boolean) => void;
  /** Dialog open state for label add/remove */
  labelDialogOpen: "add" | "remove" | null;
  setLabelDialogOpen: (mode: "add" | "remove" | null) => void;
  /** Active export job (null when no export in progress) */
  exportJob: ExportJob | undefined;
  /** Dismiss the export status panel */
  dismissExport: () => void;
  /** Handlers */
  handleExport: () => void;
  handleBulkApprove: () => void;
  handleBulkRejectConfirm: (reason: string) => void;
  handleBulkAddLabel: (tagNames: string[]) => void;
  handleBulkRemoveLabel: (tagIds: number[]) => void;
  /** Loading state for reject mutation */
  rejectLoading: boolean;
}

/* --------------------------------------------------------------------------
   Hook
   -------------------------------------------------------------------------- */

export function useBulkOperations(config: UseBulkOperationsConfig): BulkOperations {
  const { entityType, entityNoun, bulk, total, buildFilters, approveMut, rejectMut } = config;
  const { addToast } = useToast();

  // Dialog state
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [labelDialogOpen, setLabelDialogOpen] = useState<"add" | "remove" | null>(null);

  // Export state
  const [exportJobId, setExportJobId] = useState<number | null>(null);
  const createExportMut = useCreateExport();
  const { data: exportJob } = useExportStatus(exportJobId);

  /** Build the request body: IDs for explicit selection, filters for "select all matching". */
  const buildBulkBody = useCallback((): Record<string, unknown> => {
    if (bulk.selectAllMatching) {
      return { filters: buildFilters() };
    }
    return { ids: Array.from(bulk.selectedIds) };
  }, [bulk.selectAllMatching, bulk.selectedIds, buildFilters]);

  const plural = (n: number) => (n !== 1 ? "s" : "");

  const handleExport = useCallback(() => {
    const ids = bulk.selectAllMatching ? undefined : Array.from(bulk.selectedIds);
    const filters = bulk.selectAllMatching ? buildFilters() : undefined;

    createExportMut.mutate(
      { entity_type: entityType, ids, filters },
      {
        onSuccess: (job) => {
          setExportJobId(job.id);
          addToast({ message: "Export job started", variant: "success" });
        },
        onError: () => {
          addToast({ message: "Failed to create export job", variant: "error" });
        },
      },
    );
  }, [bulk, buildFilters, entityType, createExportMut, addToast]);

  const handleBulkApprove = useCallback(() => {
    const label = bulk.selectAllMatching ? `all ${total} matching` : `${bulk.selectedCount}`;
    if (!window.confirm(`Approve ${label} ${entityNoun}${plural(bulk.selectedCount)}?`)) return;
    approveMut.mutate(buildBulkBody(), {
      onSuccess: (result) => {
        addToast({ message: `Approved ${result.updated} ${entityNoun}${plural(result.updated)}`, variant: "success" });
        bulk.clearAll();
      },
      onError: () => {
        addToast({ message: `Failed to bulk-approve ${entityNoun}s`, variant: "error" });
      },
    });
  }, [bulk, total, entityNoun, approveMut, buildBulkBody, addToast]);

  const handleBulkRejectConfirm = useCallback((reason: string) => {
    rejectMut.mutate({ ...buildBulkBody(), reason }, {
      onSuccess: (result) => {
        addToast({ message: `Rejected ${result.updated} ${entityNoun}${plural(result.updated)}`, variant: "success" });
        bulk.clearAll();
        setRejectDialogOpen(false);
      },
      onError: () => {
        addToast({ message: `Failed to bulk-reject ${entityNoun}s`, variant: "error" });
      },
    });
  }, [rejectMut, buildBulkBody, entityNoun, bulk, addToast]);

  const handleBulkAddLabel = useCallback((tagNames: string[]) => {
    const entityIds = Array.from(bulk.selectedIds);
    api.post("/tags/bulk-apply", { entity_type: entityType, entity_ids: entityIds, tag_names: tagNames })
      .then(() => {
        addToast({ message: `Applied ${tagNames.length} label${plural(tagNames.length)} to ${entityIds.length} ${entityNoun}${plural(entityIds.length)}`, variant: "success" });
        bulk.clearAll();
        setLabelDialogOpen(null);
      })
      .catch(() => {
        addToast({ message: "Failed to apply labels", variant: "error" });
      });
  }, [bulk, entityType, entityNoun, addToast]);

  const handleBulkRemoveLabel = useCallback((tagIds: number[]) => {
    const entityIds = Array.from(bulk.selectedIds);
    api.post("/tags/bulk-remove", { entity_type: entityType, entity_ids: entityIds, tag_ids: tagIds })
      .then(() => {
        addToast({ message: `Removed ${tagIds.length} label${plural(tagIds.length)} from ${entityIds.length} ${entityNoun}${plural(entityIds.length)}`, variant: "success" });
        bulk.clearAll();
        setLabelDialogOpen(null);
      })
      .catch(() => {
        addToast({ message: "Failed to remove labels", variant: "error" });
      });
  }, [bulk, entityType, entityNoun, addToast]);

  return {
    rejectDialogOpen,
    setRejectDialogOpen,
    labelDialogOpen,
    setLabelDialogOpen,
    exportJob,
    dismissExport: useCallback(() => setExportJobId(null), []),
    handleExport,
    handleBulkApprove,
    handleBulkRejectConfirm,
    handleBulkAddLabel,
    handleBulkRemoveLabel,
    rejectLoading: rejectMut.isPending,
  };
}
