/**
 * Variant gallery with hero selection, approve/reject/delete actions (PRD-21).
 *
 * Displays all image variants for a avatar in a responsive grid.
 * The source image is shown on the left for side-by-side comparison.
 */

import { useCallback, useState } from "react";

import { Modal } from "@/components/composite";
import { ApprovalActions } from "@/components/domain/ApprovalActions";
import { Grid, Stack } from "@/components/layout";
import { Button ,  WireframeLoader } from "@/components/primitives";
import { cn } from "@/lib/cn";
import { TERMINAL_PANEL, TERMINAL_STATUS_COLORS } from "@/lib/ui-classes";
import { Check, Eye } from "@/tokens/icons";

import {
  useApproveVariant,
  useDeleteImageVariant,
  useExportVariant,
  useImageVariants,
  useRejectVariant,
  useUnapproveVariant,
} from "./hooks/use-image-variants";
import {
  IMAGE_VARIANT_STATUS,
  IMAGE_VARIANT_STATUS_LABEL,
  PROVENANCE_LABEL,
  canApproveVariant,
  canUnapproveVariant,
  type ImageVariant,
  type Provenance,
} from "./types";
import { ProgressiveImage  } from "@/components/primitives";
import { variantImageUrl, variantThumbnailUrl } from "./utils";

/* --------------------------------------------------------------------------
   Sub-components
   -------------------------------------------------------------------------- */

interface VariantCardProps {
  variant: ImageVariant;
  onApprove: (id: number) => void;
  onUnapprove: (id: number) => void;
  onReject: (id: number) => void;
  onExport: (id: number) => void;
  onDelete: (id: number) => void;
  onPreview: (variant: ImageVariant) => void;
}

function VariantCard({
  variant,
  onApprove,
  onUnapprove,
  onReject,
  onExport,
  onDelete,
  onPreview,
}: VariantCardProps) {
  const isGenerating = variant.status_id === IMAGE_VARIANT_STATUS.GENERATING;
  const canApprove = canApproveVariant(variant.status_id);
  const canUnapprove = canUnapproveVariant(variant.status_id);

  return (
    <div className={cn(TERMINAL_PANEL, "group/card overflow-hidden")}>
      {/* Image preview */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => onPreview(variant)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") onPreview(variant);
        }}
        className="relative cursor-pointer bg-[var(--color-surface-secondary)]"
      >
        {isGenerating ? (
          <div className="flex aspect-video items-center justify-center">
            <WireframeLoader size={48} />
          </div>
        ) : variant.file_path ? (
          <ProgressiveImage
            lowSrc={variantThumbnailUrl(variant.id, 128)}
            highSrc={variantThumbnailUrl(variant.id, 1024)}
            alt={variant.variant_label}
            className="w-full aspect-video object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex aspect-video items-center justify-center text-[var(--color-text-muted)]">
            No image
          </div>
        )}

        {/* Hero indicator */}
        {variant.is_hero && (
          <div className="absolute top-1 right-1 rounded-full bg-[var(--color-action-success)] p-1">
            <Check size={12} className="text-white" />
          </div>
        )}
      </div>

      {/* Content below image */}
      <div className="flex flex-col gap-[var(--spacing-1)] px-[var(--spacing-3)] py-[var(--spacing-2)]">
        {/* Label */}
        <p className="truncate text-sm font-medium text-[var(--color-text-primary)]">
          {variant.variant_label}
        </p>

        {/* Status & provenance */}
        <div className="flex flex-wrap items-center gap-1 font-mono text-[10px]">
          <span className={TERMINAL_STATUS_COLORS[IMAGE_VARIANT_STATUS_LABEL[variant.status_id]?.toLowerCase() ?? ""] ?? "text-[var(--color-text-muted)]"}>
            {IMAGE_VARIANT_STATUS_LABEL[variant.status_id] ?? "Unknown"}
          </span>
          <span className="opacity-30">|</span>
          <span className="text-[var(--color-text-muted)]">
            {PROVENANCE_LABEL[variant.provenance as Provenance] ?? variant.provenance}
          </span>
          {variant.variant_type && (
            <>
              <span className="opacity-30">|</span>
              <span className="text-cyan-400">{variant.variant_type}</span>
            </>
          )}
          <span className="opacity-30">|</span>
          <span className="text-[var(--color-text-muted)]">v{variant.version}</span>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-1">
          <ApprovalActions
            canApprove={canApprove}
            canUnapprove={canUnapprove}
            onApprove={() => onApprove(variant.id)}
            onUnapprove={() => onUnapprove(variant.id)}
            onReject={() => onReject(variant.id)}
            onExport={() => onExport(variant.id)}
            onDelete={() => onDelete(variant.id)}
          />
        </div>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------------
   Main component
   -------------------------------------------------------------------------- */

interface VariantGalleryProps {
  avatarId: number;
  sourceImageUrl?: string;
}

export function VariantGallery({ avatarId, sourceImageUrl }: VariantGalleryProps) {
  const { data: variants, isLoading } = useImageVariants(avatarId);
  const approveMutation = useApproveVariant(avatarId);
  const unapproveMutation = useUnapproveVariant(avatarId);
  const rejectMutation = useRejectVariant(avatarId);
  const exportMutation = useExportVariant(avatarId);
  const deleteMutation = useDeleteImageVariant(avatarId);
  const [previewVariant, setPreviewVariant] = useState<ImageVariant | null>(null);

  const handleApprove = useCallback(
    (id: number) => approveMutation.mutate(id),
    [approveMutation],
  );
  const handleUnapprove = useCallback(
    (id: number) => unapproveMutation.mutate(id),
    [unapproveMutation],
  );
  const handleReject = useCallback(
    (id: number) => rejectMutation.mutate(id),
    [rejectMutation],
  );
  const handleExport = useCallback(
    (id: number) => exportMutation.mutate(id),
    [exportMutation],
  );
  const handleDelete = useCallback(
    (id: number) => deleteMutation.mutate(id),
    [deleteMutation],
  );

  if (isLoading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <WireframeLoader size={64} />
      </div>
    );
  }

  return (
    <>
      <Stack gap={4}>
        <h3 className="text-sm font-medium text-[var(--color-text-primary)]">
          Image Variants
        </h3>

        <div className="flex gap-6">
          {/* Source image reference */}
          {sourceImageUrl && (
            <div className="shrink-0">
              <div className={TERMINAL_PANEL}>
                <div className="p-[var(--spacing-2)]">
                  <Stack gap={2}>
                    <p className="font-mono text-[10px] uppercase tracking-wide text-[var(--color-text-muted)]">
                      Source Image
                    </p>
                    <img
                      src={sourceImageUrl}
                      alt="Source image"
                      className="h-40 w-40 rounded-[var(--radius-sm)] object-cover"
                    />
                  </Stack>
                </div>
              </div>
            </div>
          )}

          {/* Variant grid */}
          <div className="flex-1">
            {!variants || variants.length === 0 ? (
              <div className="flex h-48 items-center justify-center rounded-[var(--radius-md)] border border-dashed border-[var(--color-border-default)]">
                <p className="text-sm text-[var(--color-text-muted)]">
                  No variants yet. Generate or upload variants to get started.
                </p>
              </div>
            ) : (
              <Grid cols={3} gap={4}>
                {variants.map((variant) => (
                  <VariantCard
                    key={variant.id}
                    variant={variant}
                    onApprove={handleApprove}
                    onUnapprove={handleUnapprove}
                    onReject={handleReject}
                    onExport={handleExport}
                    onDelete={handleDelete}
                    onPreview={setPreviewVariant}
                  />
                ))}
              </Grid>
            )}
          </div>
        </div>
      </Stack>

      {/* Large preview modal */}
      <Modal
        open={previewVariant !== null}
        onClose={() => setPreviewVariant(null)}
        title={previewVariant?.variant_label ?? ""}
        size="lg"
      >
        {previewVariant && (
          <Stack gap={4}>
            <div className="flex justify-center">
              {previewVariant.file_path ? (
                <img
                  src={variantImageUrl(previewVariant.file_path)}
                  alt={previewVariant.variant_label}
                  className="max-h-[60vh] rounded-[var(--radius-md)] object-contain"
                />
              ) : (
                <div className="flex h-48 w-full items-center justify-center font-mono text-xs text-[var(--color-text-muted)]">
                  No image available
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
              <span className={TERMINAL_STATUS_COLORS[IMAGE_VARIANT_STATUS_LABEL[previewVariant.status_id]?.toLowerCase() ?? ""] ?? "text-[var(--color-text-muted)]"}>
                {IMAGE_VARIANT_STATUS_LABEL[previewVariant.status_id]}
              </span>
              <span className="opacity-30">|</span>
              <span className="text-[var(--color-text-muted)]">
                {PROVENANCE_LABEL[previewVariant.provenance as Provenance] ?? previewVariant.provenance}
              </span>
              {previewVariant.width && previewVariant.height && (
                <>
                  <span className="opacity-30">|</span>
                  <span className="flex items-center gap-1 text-cyan-400">
                    <Eye size={12} />
                    {previewVariant.width} x {previewVariant.height}
                  </span>
                </>
              )}
              {previewVariant.format && (
                <>
                  <span className="opacity-30">|</span>
                  <span className="text-[var(--color-text-muted)]">{previewVariant.format.toUpperCase()}</span>
                </>
              )}
              <span className="opacity-30">|</span>
              <span className="text-[var(--color-text-muted)]">v{previewVariant.version}</span>
              {previewVariant.is_hero && (
                <>
                  <span className="opacity-30">|</span>
                  <span className="text-green-400">Hero</span>
                </>
              )}
            </div>

            <div className="flex justify-end pt-1 border-t border-[var(--color-border-default)]">
              <Button variant="secondary" size="sm" onClick={() => setPreviewVariant(null)}>
                Close
              </Button>
            </div>
          </Stack>
        )}
      </Modal>
    </>
  );
}
