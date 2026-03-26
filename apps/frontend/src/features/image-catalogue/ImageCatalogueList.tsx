/**
 * Image catalogue list view (PRD-154).
 *
 * Displays all image types in a terminal-styled table with track info,
 * active/inactive status, and edit/deactivate actions.
 */

import { useCallback, useState } from "react";

import { Modal } from "@/components/composite";
import { Stack } from "@/components/layout";
import { Button, ContextLoader, Toggle } from "@/components/primitives";
import { cn } from "@/lib/cn";
import {
  GHOST_DANGER_BTN,
  TERMINAL_BODY,
  TERMINAL_DIVIDER,
  TERMINAL_HEADER,
  TERMINAL_HEADER_TITLE,
  TERMINAL_PANEL,
  TERMINAL_ROW_HOVER,
  TERMINAL_STATUS_COLORS,
  TERMINAL_TH,
} from "@/lib/ui-classes";
import { Plus } from "@/tokens/icons";

import { usePipelineContextSafe } from "@/features/pipelines";

import { ImageCatalogueForm } from "./ImageCatalogueForm";
import { useDeleteImageType, useImageTypes } from "./hooks/use-image-catalogue";
import type { ImageType } from "./types";

/* --------------------------------------------------------------------------
   Entry row
   -------------------------------------------------------------------------- */

interface EntryRowProps {
  entry: ImageType;
  onEdit: (entry: ImageType) => void;
  onDeactivate: (entry: ImageType) => void;
}

function EntryRow({ entry, onEdit, onDeactivate }: EntryRowProps) {
  const statusColor = TERMINAL_STATUS_COLORS[entry.is_active ? "active" : "pending"] ?? "text-[var(--color-text-muted)]";

  return (
    <tr className={cn(TERMINAL_DIVIDER, TERMINAL_ROW_HOVER)}>
      <td className="px-3 py-1.5">
        <div className="flex flex-col">
          <span className="font-mono text-xs text-cyan-400">{entry.name}</span>
          <span className="font-mono text-[10px] text-[var(--color-text-muted)] mt-0.5">{entry.slug}</span>
        </div>
      </td>
      <td className="px-3 py-1.5 font-mono text-xs text-[var(--color-text-muted)]">
        {entry.tracks.length === 0 ? (
          <span>None</span>
        ) : (
          entry.tracks.map((t, i) => (
            <span key={t.id}>
              {i > 0 && <span className="opacity-30 mx-1">|</span>}
              <span className="text-[var(--color-text-primary)]">{t.name}</span>
            </span>
          ))
        )}
      </td>
      <td className="px-3 py-1.5 font-mono text-xs text-[var(--color-text-muted)]">
        {entry.sort_order}
      </td>
      <td className="px-3 py-1.5">
        <span className={cn("font-mono text-xs", statusColor)}>
          {entry.is_active ? "Active" : "Inactive"}
        </span>
      </td>
      <td className="px-3 py-1.5">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="xs" onClick={() => onEdit(entry)}>
            Edit
          </Button>
          {entry.is_active && (
            <Button
              variant="ghost"
              size="xs"
              className={GHOST_DANGER_BTN}
              onClick={() => onDeactivate(entry)}
            >
              Deactivate
            </Button>
          )}
        </div>
      </td>
    </tr>
  );
}

/* --------------------------------------------------------------------------
   Main component
   -------------------------------------------------------------------------- */

export function ImageCatalogueList() {
  const pipelineCtx = usePipelineContextSafe();
  const { data: entries, isLoading } = useImageTypes(pipelineCtx?.pipelineId);
  const deactivateMutation = useDeleteImageType();

  const [formOpen, setFormOpen] = useState(false);
  const [editEntry, setEditEntry] = useState<ImageType | undefined>();
  const [deactivateTarget, setDeactivateTarget] = useState<ImageType | null>(null);
  const [showInactive, setShowInactive] = useState(false);

  const handleEdit = useCallback((entry: ImageType) => {
    setEditEntry(entry);
    setFormOpen(true);
  }, []);

  const handleCreate = useCallback(() => {
    setEditEntry(undefined);
    setFormOpen(true);
  }, []);

  const handleFormClose = useCallback(() => {
    setFormOpen(false);
    setEditEntry(undefined);
  }, []);

  const handleConfirmDeactivate = useCallback(() => {
    if (!deactivateTarget) return;
    deactivateMutation.mutate(deactivateTarget.id, {
      onSuccess: () => setDeactivateTarget(null),
    });
  }, [deactivateTarget, deactivateMutation]);

  const visibleEntries = showInactive
    ? entries
    : entries?.filter((e) => e.is_active);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <ContextLoader size={64} />
      </div>
    );
  }

  return (
    <Stack gap={6}>
      <div className={TERMINAL_PANEL}>
        <div className={cn(TERMINAL_HEADER, "flex items-center justify-between")}>
          <span className={TERMINAL_HEADER_TITLE}>Image Catalogue</span>
          <div className="flex items-center gap-4">
            <Toggle
              checked={showInactive}
              onChange={setShowInactive}
              label="Show Inactive"
              size="sm"
            />
            <Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={handleCreate}>
              Add Image Type
            </Button>
          </div>
        </div>
        <div className={TERMINAL_BODY}>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className={TERMINAL_DIVIDER}>
                  <th className={cn(TERMINAL_TH, "px-3 py-1.5")}>Name</th>
                  <th className={cn(TERMINAL_TH, "px-3 py-1.5")}>Tracks</th>
                  <th className={cn(TERMINAL_TH, "px-3 py-1.5")}>Sort</th>
                  <th className={cn(TERMINAL_TH, "px-3 py-1.5")}>Status</th>
                  <th className={cn(TERMINAL_TH, "px-3 py-1.5")}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {!visibleEntries || visibleEntries.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-3 py-6 text-center font-mono text-xs text-[var(--color-text-muted)]"
                    >
                      No image types. Click "Add Image Type" to create one.
                    </td>
                  </tr>
                ) : (
                  visibleEntries.map((entry) => (
                    <EntryRow
                      key={entry.id}
                      entry={entry}
                      onEdit={handleEdit}
                      onDeactivate={setDeactivateTarget}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Create/Edit modal */}
      <ImageCatalogueForm
        key={editEntry?.id ?? "new"}
        entry={editEntry}
        open={formOpen}
        onClose={handleFormClose}
      />

      {/* Deactivate confirmation */}
      <Modal
        open={deactivateTarget !== null}
        onClose={() => setDeactivateTarget(null)}
        title="Deactivate Image Type"
        size="sm"
      >
        {deactivateTarget && (
          <Stack gap={4}>
            <p className="font-mono text-xs text-[var(--color-text-secondary)]">
              Are you sure you want to deactivate{" "}
              <strong className="text-cyan-400">{deactivateTarget.name}</strong>?
              It will no longer appear in image settings.
            </p>
            <div className="flex justify-end gap-2 pt-1 border-t border-[var(--color-border-default)]">
              <Button variant="secondary" size="sm" onClick={() => setDeactivateTarget(null)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={handleConfirmDeactivate}
                loading={deactivateMutation.isPending}
              >
                Deactivate
              </Button>
            </div>
          </Stack>
        )}
      </Modal>
    </Stack>
  );
}
