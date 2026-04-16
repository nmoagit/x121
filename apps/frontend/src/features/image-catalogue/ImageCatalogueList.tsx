/**
 * Image catalogue list view (PRD-154).
 *
 * Simple row list — click a row to open the edit modal.
 */

import { useCallback, useState } from "react";

import { ConfirmDeleteModal } from "@/components/composite";
import { EmptyState } from "@/components/domain";
import { Stack } from "@/components/layout";
import { Button, LoadingPane } from "@/components/primitives";
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
  TRACK_TEXT_COLORS,
} from "@/lib/ui-classes";
import { ArrowRight, Plus, Trash2 } from "@/tokens/icons";

import { usePipelineContextSafe } from "@/features/pipelines";
import { useTracks } from "@/features/scene-catalogue/hooks/use-tracks";
import { ImageCatalogueForm } from "./ImageCatalogueForm";
import { useDeleteImageType, useImageTypes } from "./hooks/use-image-catalogue";
import type { ImageType } from "./types";
import { TYPO_DATA_CYAN } from "@/lib/typography-tokens";

/* --------------------------------------------------------------------------
   Main component
   -------------------------------------------------------------------------- */

export function ImageCatalogueList({ onSwitchTab }: { onSwitchTab?: (tab: string) => void } = {}) {
  const pipelineCtx = usePipelineContextSafe();
  const { data: imageTypes, isLoading } = useImageTypes(pipelineCtx?.pipelineId);
  const { data: tracks } = useTracks(false, pipelineCtx?.pipelineId);
  const deleteMutation = useDeleteImageType();

  const [formOpen, setFormOpen] = useState(false);
  const [editEntry, setEditEntry] = useState<ImageType | undefined>();
  const [deleting, setDeleting] = useState<ImageType | null>(null);

  const trackName = (id: number | null) => tracks?.find((t) => t.id === id)?.name ?? null;
  const trackSlug = (id: number | null) => tracks?.find((t) => t.id === id)?.slug ?? "";
  const handleCreate = useCallback(() => {
    setEditEntry(undefined);
    setFormOpen(true);
  }, []);

  const handleEdit = useCallback((it: ImageType) => {
    setEditEntry(it);
    setFormOpen(true);
  }, []);

  const handleFormClose = useCallback(() => {
    setFormOpen(false);
    setEditEntry(undefined);
  }, []);

  const handleDeleteConfirm = useCallback(() => {
    if (!deleting) return;
    deleteMutation.mutate(deleting.id, { onSuccess: () => setDeleting(null) });
  }, [deleting, deleteMutation]);

  if (isLoading) return <LoadingPane />;

  if (!imageTypes?.length && !formOpen) {
    return (
      <>
        <EmptyState
          title="No Image Types"
          description="Create your first image type to define workflow configurations for image generation."
          action={
            <Button variant="primary" size="sm" onClick={handleCreate}>
              Create Image Type
            </Button>
          }
        />
        <ImageCatalogueForm open={formOpen} onClose={handleFormClose} />
      </>
    );
  }

  return (
    <Stack gap={4}>
      <div className={TERMINAL_PANEL}>
        <div className={cn(TERMINAL_HEADER, "flex items-center justify-between")}>
          <span className={TERMINAL_HEADER_TITLE}>Image Types</span>
          <Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={handleCreate}>
            New
          </Button>
        </div>
        <div className={TERMINAL_BODY}>
          {(imageTypes ?? []).map((it) => {
            const src = trackName(it.source_track_id);
            const out = trackName(it.output_track_id);
            const srcSlug = trackSlug(it.source_track_id);
            const outSlug = trackSlug(it.output_track_id);
            return (
              <div
                key={it.id}
                role="button"
                tabIndex={0}
                className={cn(TERMINAL_DIVIDER, TERMINAL_ROW_HOVER, "flex items-center justify-between px-3 py-2 cursor-pointer")}
                onClick={() => handleEdit(it)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") handleEdit(it); }}
              >
                <div className="flex items-center gap-4 min-w-0">
                  {/* Name */}
                  <span className={`${TYPO_DATA_CYAN} w-[140px] truncate shrink-0`}>
                    {it.name}
                  </span>

                  {/* Source → Output */}
                  {src && out && (
                    <div className="flex items-center gap-1 font-mono text-[10px] shrink-0">
                      <span className={TRACK_TEXT_COLORS[srcSlug] ?? "text-[var(--color-text-muted)]"}>{src}</span>
                      <ArrowRight size={8} className="text-[var(--color-text-muted)]" />
                      <span className={TRACK_TEXT_COLORS[outSlug] ?? "text-[var(--color-text-muted)]"}>{out}</span>
                    </div>
                  )}

                  {/* Description */}
                  {it.description && (
                    <span className="font-mono text-[10px] text-[var(--color-text-muted)] truncate">
                      {it.description}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span className={cn("font-mono text-[10px]", TERMINAL_STATUS_COLORS[it.is_active ? "active" : "pending"])}>
                    {it.is_active ? "active" : "off"}
                  </span>
                  <Button
                    variant="ghost"
                    size="xs"
                    className={GHOST_DANGER_BTN}
                    icon={<Trash2 size={12} />}
                    onClick={(e) => { e.stopPropagation(); setDeleting(it); }}
                    aria-label="Delete"
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Create/Edit modal */}
      <ImageCatalogueForm
        key={editEntry?.id ?? "new"}
        entry={editEntry}
        open={formOpen}
        onClose={handleFormClose}
        onSwitchTab={onSwitchTab}
      />

      <ConfirmDeleteModal
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title="Delete Image Type"
        entityName={deleting?.name ?? ""}
        warningText="All avatar images using this type will need to be reconfigured."
        onConfirm={handleDeleteConfirm}
        loading={deleteMutation.isPending}
      />
    </Stack>
  );
}
