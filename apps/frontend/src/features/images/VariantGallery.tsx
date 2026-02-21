/**
 * Variant gallery with hero selection, approve/reject/delete actions (PRD-21).
 *
 * Displays all image variants for a character in a responsive grid.
 * The source image is shown on the left for side-by-side comparison.
 */

import { useCallback, useState } from "react";

import { Card, Modal } from "@/components/composite";
import { Grid, Stack } from "@/components/layout";
import { Badge, Button, Spinner } from "@/components/primitives";
import { Check, Download, Eye, Trash2, XCircle } from "@/tokens/icons";

import {
  useApproveVariant,
  useDeleteImageVariant,
  useExportVariant,
  useImageVariants,
  useRejectVariant,
} from "./hooks/use-image-variants";
import {
  IMAGE_VARIANT_STATUS,
  IMAGE_VARIANT_STATUS_LABEL,
  PROVENANCE_LABEL,
  type ImageVariant,
  type ImageVariantStatusId,
  type Provenance,
} from "./types";

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

/** Map status ID to Badge variant for visual consistency. */
function statusBadgeVariant(
  statusId: ImageVariantStatusId,
): "success" | "danger" | "warning" | "info" | "default" {
  switch (statusId) {
    case IMAGE_VARIANT_STATUS.APPROVED:
      return "success";
    case IMAGE_VARIANT_STATUS.REJECTED:
      return "danger";
    case IMAGE_VARIANT_STATUS.GENERATING:
      return "warning";
    case IMAGE_VARIANT_STATUS.GENERATED:
      return "info";
    case IMAGE_VARIANT_STATUS.EDITING:
      return "warning";
    default:
      return "default";
  }
}

/* --------------------------------------------------------------------------
   Sub-components
   -------------------------------------------------------------------------- */

interface VariantCardProps {
  variant: ImageVariant;
  onApprove: (id: number) => void;
  onReject: (id: number) => void;
  onExport: (id: number) => void;
  onDelete: (id: number) => void;
  onPreview: (variant: ImageVariant) => void;
}

function VariantCard({
  variant,
  onApprove,
  onReject,
  onExport,
  onDelete,
  onPreview,
}: VariantCardProps) {
  const isGenerating = variant.status_id === IMAGE_VARIANT_STATUS.GENERATING;
  const canApprove =
    variant.status_id === IMAGE_VARIANT_STATUS.GENERATED ||
    variant.status_id === IMAGE_VARIANT_STATUS.EDITING ||
    variant.status_id === IMAGE_VARIANT_STATUS.PENDING;

  return (
    <Card elevation="sm" padding="sm">
      <Stack gap={2}>
        {/* Image preview */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => onPreview(variant)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") onPreview(variant);
          }}
          className="relative cursor-pointer overflow-hidden rounded-[var(--radius-sm)] bg-[var(--color-surface-secondary)]"
        >
          {isGenerating ? (
            <div className="flex h-32 items-center justify-center">
              <Spinner size="md" />
            </div>
          ) : variant.file_path ? (
            <img
              src={variant.file_path}
              alt={variant.variant_label}
              className="h-32 w-full object-cover"
            />
          ) : (
            <div className="flex h-32 items-center justify-center text-[var(--color-text-muted)]">
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

        {/* Label */}
        <p className="truncate text-sm font-medium text-[var(--color-text-primary)]">
          {variant.variant_label}
        </p>

        {/* Status & provenance badges */}
        <div className="flex flex-wrap gap-1">
          <Badge
            variant={statusBadgeVariant(variant.status_id)}
            size="sm"
          >
            {IMAGE_VARIANT_STATUS_LABEL[variant.status_id] ?? "Unknown"}
          </Badge>
          <Badge variant="default" size="sm">
            {PROVENANCE_LABEL[variant.provenance as Provenance] ?? variant.provenance}
          </Badge>
          {variant.variant_type && (
            <Badge variant="info" size="sm">
              {variant.variant_type}
            </Badge>
          )}
          <Badge variant="default" size="sm">
            v{variant.version}
          </Badge>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-1">
          {canApprove && (
            <Button
              variant="primary"
              size="sm"
              icon={<Check size={14} />}
              onClick={() => onApprove(variant.id)}
              aria-label={`Approve ${variant.variant_label}`}
            >
              Approve
            </Button>
          )}
          {canApprove && (
            <Button
              variant="secondary"
              size="sm"
              icon={<XCircle size={14} />}
              onClick={() => onReject(variant.id)}
              aria-label={`Reject ${variant.variant_label}`}
            >
              Reject
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            icon={<Download size={14} />}
            onClick={() => onExport(variant.id)}
            aria-label={`Export ${variant.variant_label}`}
          >
            Export
          </Button>
          <Button
            variant="danger"
            size="sm"
            icon={<Trash2 size={14} />}
            onClick={() => onDelete(variant.id)}
            aria-label={`Delete ${variant.variant_label}`}
          >
            Delete
          </Button>
        </div>
      </Stack>
    </Card>
  );
}

/* --------------------------------------------------------------------------
   Main component
   -------------------------------------------------------------------------- */

interface VariantGalleryProps {
  characterId: number;
  sourceImageUrl?: string;
}

export function VariantGallery({ characterId, sourceImageUrl }: VariantGalleryProps) {
  const { data: variants, isLoading } = useImageVariants(characterId);
  const approveMutation = useApproveVariant(characterId);
  const rejectMutation = useRejectVariant(characterId);
  const exportMutation = useExportVariant(characterId);
  const deleteMutation = useDeleteImageVariant(characterId);
  const [previewVariant, setPreviewVariant] = useState<ImageVariant | null>(null);

  const handleApprove = useCallback(
    (id: number) => approveMutation.mutate(id),
    [approveMutation],
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
        <Spinner size="lg" />
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
              <Card elevation="sm" padding="sm">
                <Stack gap={2}>
                  <p className="text-xs font-medium text-[var(--color-text-muted)]">
                    Source Image
                  </p>
                  <img
                    src={sourceImageUrl}
                    alt="Source image"
                    className="h-40 w-40 rounded-[var(--radius-sm)] object-cover"
                  />
                </Stack>
              </Card>
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
                  src={previewVariant.file_path}
                  alt={previewVariant.variant_label}
                  className="max-h-[60vh] rounded-[var(--radius-md)] object-contain"
                />
              ) : (
                <div className="flex h-48 w-full items-center justify-center text-[var(--color-text-muted)]">
                  No image available
                </div>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              <Badge
                variant={statusBadgeVariant(previewVariant.status_id)}
                size="sm"
              >
                {IMAGE_VARIANT_STATUS_LABEL[previewVariant.status_id]}
              </Badge>
              <Badge variant="default" size="sm">
                {PROVENANCE_LABEL[previewVariant.provenance as Provenance] ?? previewVariant.provenance}
              </Badge>
              {previewVariant.width && previewVariant.height && (
                <Badge variant="info" size="sm">
                  <Eye size={12} className="mr-1 inline-block" />
                  {previewVariant.width} x {previewVariant.height}
                </Badge>
              )}
              {previewVariant.format && (
                <Badge variant="default" size="sm">
                  {previewVariant.format.toUpperCase()}
                </Badge>
              )}
              <Badge variant="default" size="sm">
                v{previewVariant.version}
              </Badge>
              {previewVariant.is_hero && (
                <Badge variant="success" size="sm">
                  Hero
                </Badge>
              )}
            </div>

            <div className="flex justify-end">
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
