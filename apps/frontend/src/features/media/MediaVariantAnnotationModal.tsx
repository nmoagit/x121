/**
 * Annotation modal for image variants.
 *
 * Displays a static image with a DrawingCanvas overlay for drawing annotations.
 * Since images are static, all annotations target frame 0.
 * Follows the same pattern as ClipPlaybackModal but simplified for single-frame use.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { Modal } from "@/components/composite";
import { Button } from "@/components/primitives/Button";
import { DrawingCanvas } from "@/features/annotations/DrawingCanvas";
import type { DrawingObject } from "@/features/annotations/types";
import { Edit3, Trash2, X } from "@/tokens/icons";

import {
  useDeleteMediaVariantFrameAnnotation,
  useMediaVariantAnnotations,
  useUpsertMediaVariantAnnotation,
} from "./hooks/useMediaVariantAnnotations";
import type { MediaVariant } from "./types";
import { variantMediaUrl } from "./utils";

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

/** Image variants are static — all annotations target frame 0. */
const FRAME_NUMBER = 0;

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface MediaVariantAnnotationModalProps {
  avatarId: number;
  variant: MediaVariant | null;
  onClose: () => void;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function MediaVariantAnnotationModal({
  avatarId,
  variant,
  onClose,
}: MediaVariantAnnotationModalProps) {
  const [annotating, setAnnotating] = useState(false);
  const [containerWidth, setContainerWidth] = useState(0);
  const [imageHeight, setImageHeight] = useState(0);
  const [localAnnotations, setLocalAnnotations] = useState<DrawingObject[]>([]);
  const [dirty, setDirty] = useState(false);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const existingCountRef = useRef(0);
  const existingSnapshotRef = useRef<DrawingObject[]>([]);

  const variantId = variant?.id ?? 0;

  // ---- DB persistence via TanStack Query ----
  const { data: dbAnnotations } = useMediaVariantAnnotations(avatarId, variantId);
  const upsertMutation = useUpsertMediaVariantAnnotation(avatarId, variantId);
  const deleteMutation = useDeleteMediaVariantFrameAnnotation(avatarId, variantId);

  // Seed local state from DB when data arrives
  useEffect(() => {
    if (!dbAnnotations?.length || variantId === 0) return;
    const frame0 = dbAnnotations.find((a) => a.frame_number === FRAME_NUMBER);
    if (frame0) {
      setLocalAnnotations(frame0.annotations_json as unknown as DrawingObject[]);
    }
  }, [dbAnnotations, variantId]);

  // Reset state when variant changes
  useEffect(() => {
    setAnnotating(false);
    setDirty(false);
    setLocalAnnotations([]);
    existingCountRef.current = 0;
    existingSnapshotRef.current = [];
  }, [variantId]);

  // Measure container width for canvas sizing
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    setContainerWidth(el.clientWidth);
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [variant]);

  // Measure image natural aspect ratio to compute canvas height
  const handleImageLoad = useCallback(
    (e: React.SyntheticEvent<HTMLImageElement>) => {
      const img = e.currentTarget;
      if (img.naturalWidth > 0 && containerWidth > 0) {
        const ratio = img.naturalHeight / img.naturalWidth;
        setImageHeight(Math.round(containerWidth * ratio));
      }
    },
    [containerWidth],
  );

  /** Save annotations to the DB. */
  const saveAnnotations = useCallback(() => {
    if (variantId === 0) return;
    upsertMutation.mutate({
      frameNumber: FRAME_NUMBER,
      annotations: localAnnotations,
    });
    setDirty(false);
  }, [variantId, localAnnotations, upsertMutation]);

  const enterAnnotation = useCallback(() => {
    existingCountRef.current = localAnnotations.length;
    existingSnapshotRef.current = localAnnotations;
    setAnnotating(true);
  }, [localAnnotations]);

  const exitAnnotation = useCallback(() => {
    setAnnotating(false);
    if (dirty) {
      saveAnnotations();
    }
  }, [dirty, saveAnnotations]);

  const handleAnnotationsChange = useCallback(
    (newAnnotations: DrawingObject[]) => {
      setDirty(true);
      const base = existingSnapshotRef.current.slice(0, existingCountRef.current);
      const merged = [...base, ...newAnnotations];
      setLocalAnnotations(merged);
    },
    [],
  );

  const handleDeleteAnnotations = useCallback(() => {
    setLocalAnnotations([]);
    setDirty(false);
    deleteMutation.mutate(FRAME_NUMBER);
    if (annotating) {
      setAnnotating(false);
    }
  }, [deleteMutation, annotating]);

  const handleClose = useCallback(() => {
    if (dirty) {
      saveAnnotations();
    }
    onClose();
  }, [dirty, saveAnnotations, onClose]);

  const canvasKey = `canvas-variant-${variantId}`;
  const annotationCount = localAnnotations.length;

  return (
    <Modal
      open={variant !== null}
      onClose={handleClose}
      title={variant ? `Annotate: ${variant.variant_label}` : ""}
      size="3xl"
    >
      {variant && (
        <div className="flex flex-col gap-[var(--spacing-3)]">
          {/* Image + annotation overlay */}
          <div ref={wrapperRef} className="relative">
            <img
              src={variantMediaUrl(variant.file_path ?? "")}
              alt={variant.variant_label}
              className="w-full rounded-[var(--radius-md)] object-contain"
              onLoad={handleImageLoad}
            />

            {annotating && containerWidth > 0 && imageHeight > 0 && (
              <div
                className="absolute top-0 left-0 z-10"
                style={{ width: containerWidth, height: imageHeight }}
              >
                <DrawingCanvas
                  key={canvasKey}
                  width={containerWidth}
                  height={imageHeight}
                  existingAnnotations={existingSnapshotRef.current}
                  onAnnotationsChange={handleAnnotationsChange}
                  editable
                  overlay
                />
              </div>
            )}
          </div>

          {/* Annotation controls */}
          <div className="flex items-center gap-[var(--spacing-2)]">
            <Button
              size="sm"
              variant={annotating ? "primary" : "secondary"}
              icon={annotating ? <X size={14} /> : <Edit3 size={14} />}
              onClick={annotating ? exitAnnotation : enterAnnotation}
            >
              {annotating ? "Exit Annotation" : "Annotate"}
            </Button>

            {annotationCount > 0 && (
              <span className="font-mono text-xs text-cyan-400">
                {annotationCount} mark{annotationCount !== 1 ? "s" : ""}
              </span>
            )}

            {annotationCount > 0 && !annotating && (
              <Button
                size="sm"
                variant="danger"
                icon={<Trash2 size={14} />}
                onClick={handleDeleteAnnotations}
              >
                Clear All
              </Button>
            )}

            {upsertMutation.isPending && (
              <span className="font-mono text-xs text-[var(--color-text-muted)]">Saving…</span>
            )}

            {dirty && !upsertMutation.isPending && (
              <span className="font-mono text-xs text-orange-400">Unsaved changes</span>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
