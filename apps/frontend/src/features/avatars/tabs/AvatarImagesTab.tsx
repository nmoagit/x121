/**
 * Avatar images tab — track seed image cards with detail modal (PRD-112).
 *
 * Shows a card per active track with hero image preview. Clicking a card opens
 * a detail modal with the seed image, all variants for that track, and actions
 * to approve/reject/delete variants and delete the seed image.
 * Navigation arrows allow cycling through tracks.
 */

import { useCallback, useMemo, useState } from "react";

import { Modal } from "@/components/composite/Modal";
import { Grid, Stack } from "@/components/layout";
import { ApprovalActions } from "@/components/domain/ApprovalActions";
import { Button ,  ContextLoader } from "@/components/primitives";
import { ChevronLeft, ChevronRight, Trash2, Upload, Wand2 } from "@/tokens/icons";

import {
  useApproveVariant,
  useDeleteMediaVariant,
  useExportVariant,
  useMediaVariants,
  useRejectVariant,
  useUnapproveVariant,
} from "@/features/media/hooks/use-media-variants";
import { MediaVariantAnnotationModal } from "@/features/media/MediaVariantAnnotationModal";
import {
  MEDIA_VARIANT_STATUS_LABEL,
  PROVENANCE_LABEL,
  canApproveVariant,
  canUnapproveVariant,
  statusBadgeVariant,
} from "@/features/media/types";
import type { MediaVariant, Provenance } from "@/features/media/types";
import { variantMediaUrl, variantThumbnailUrl } from "@/features/media/utils";
import { ProgressiveImage  } from "@/components/primitives";
import { TrackImageCard } from "./TrackImageCard";
import { TRACK_TEXT_COLORS } from "@/lib/ui-classes";
import { useTrackImageActions } from "./useTrackImageActions";

/* --------------------------------------------------------------------------
   Detail modal variant card (inline — only used inside the modal)
   -------------------------------------------------------------------------- */

interface ModalVariantCardProps {
  variant: MediaVariant;
  onApprove: (id: number) => void;
  onUnapprove: (id: number) => void;
  onReject: (id: number) => void;
  onExport: (id: number) => void;
  onDelete: (id: number) => void;
  onAnnotate: (variant: MediaVariant) => void;
}

function ModalVariantCard({ variant, onApprove, onUnapprove, onReject, onExport, onDelete, onAnnotate }: ModalVariantCardProps) {
  const canApprove = canApproveVariant(variant.status_id);
  const canUnapprove = canUnapproveVariant(variant.status_id);

  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[#0d1117] overflow-hidden">
      {/* Thumbnail — click to annotate */}
      {variant.file_path ? (
        <div
          role="button"
          tabIndex={0}
          onClick={() => onAnnotate(variant)}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onAnnotate(variant); }}
          className="cursor-pointer"
          title="Click to annotate"
        >
          <ProgressiveImage
            lowSrc={variantThumbnailUrl(variant.id, 128)}
            highSrc={variantThumbnailUrl(variant.id, 512)}
            alt={variant.variant_label}
            className="w-full aspect-video object-cover"
            loading="lazy"
          />
        </div>
      ) : (
        <div className="flex aspect-video items-center justify-center text-xs text-[var(--color-text-muted)] font-mono bg-[#161b22]">
          No image
        </div>
      )}

      {/* Info + actions */}
      <div className="px-2 py-1.5 space-y-1.5">
        <div className="flex items-center justify-between gap-1">
          <p className="truncate text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide font-mono">
            {variant.variant_label}
          </p>
          {variant.is_hero && <span className="text-[10px] font-mono text-green-400">hero</span>}
        </div>
        <div className="flex items-center gap-2 font-mono text-[10px] text-[var(--color-text-muted)]">
          <span className={statusBadgeVariant(variant.status_id) === "success" ? "text-green-400" : "text-cyan-400"}>
            {(MEDIA_VARIANT_STATUS_LABEL[variant.status_id] ?? "unknown").toLowerCase()}
          </span>
          <span className="opacity-30">|</span>
          <span>{(PROVENANCE_LABEL[variant.provenance as Provenance] ?? variant.provenance).toLowerCase()}</span>
          <span className="opacity-30">|</span>
          <span>v{variant.version}</span>
        </div>
        <div className="flex items-center gap-1">
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
   Component
   -------------------------------------------------------------------------- */

interface AvatarImagesTabProps {
  avatarId: number;
  projectId?: number;
}

export function AvatarImagesTab({ avatarId, projectId }: AvatarImagesTabProps) {
  const {
    activeTracks,
    trackImageData,
    toplessHeroExists,
    seedSlotNames,
    isSingleTrack,
    confirmGenerateTrack,
    setConfirmGenerateTrack,
    handleGenerateTrackImage,
    handleConfirmedGenerate,
    handleUploadTrackImage,
    generating,
  } = useTrackImageActions(avatarId, projectId);
  const [detailTrackIndex, setDetailTrackIndex] = useState<number | null>(null);
  const [annotatingVariant, setAnnotatingVariant] = useState<MediaVariant | null>(null);

  // All variants for the avatar (used in detail modal, filtered by track)
  const { data: allVariants, isLoading: variantsLoading } = useMediaVariants(avatarId);
  const approveMutation = useApproveVariant(avatarId);
  const unapproveMutation = useUnapproveVariant(avatarId);
  const rejectMutation = useRejectVariant(avatarId);
  const exportMutation = useExportVariant(avatarId);
  const deleteMutation = useDeleteMediaVariant(avatarId);

  const handleApprove = useCallback((id: number) => approveMutation.mutate(id), [approveMutation]);
  const handleUnapprove = useCallback((id: number) => unapproveMutation.mutate(id), [unapproveMutation]);
  const handleReject = useCallback((id: number) => rejectMutation.mutate(id), [rejectMutation]);
  const handleExport = useCallback((id: number) => exportMutation.mutate(id), [exportMutation]);
  const handleDelete = useCallback((id: number) => deleteMutation.mutate(id), [deleteMutation]);

  // Current detail track data
  const detailTrack = detailTrackIndex !== null ? trackImageData[detailTrackIndex] : null;

  // Variants for the currently open track.
  // For single-track pipelines, match seed slot names too (e.g. "reference" for "main" track).
  const trackVariants = useMemo(() => {
    if (!detailTrack || !allVariants) return [];
    const slug = detailTrack.track.slug.toLowerCase();
    const matchTypes = new Set([slug]);
    if (isSingleTrack) {
      for (const name of seedSlotNames) matchTypes.add(name);
    }
    return allVariants.filter(
      (v) => v.variant_type && matchTypes.has(v.variant_type.toLowerCase()) && !v.deleted_at,
    );
  }, [detailTrack, allVariants, isSingleTrack, seedSlotNames]);

  return (
    <Stack gap={6}>
      {/* Track seed image cards */}
      {activeTracks.length > 0 && (
        <div className="space-y-[var(--spacing-2)]">
          <h3 className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide font-mono">Seed Images</h3>
          <Grid cols={4} gap={4}>
            {trackImageData.map(({ track, hero }, index) => (
              <TrackImageCard
                key={track.id}
                track={track}
                heroVariant={hero}
                canGenerate={!isSingleTrack && track.slug.toLowerCase() === "clothed"}
                generateEnabled={toplessHeroExists}
                generateDisabledReason={
                  !toplessHeroExists ? "Upload a topless hero image first" : null
                }
                onGenerate={() => handleGenerateTrackImage(track.slug)}
                generating={generating}
                onUpload={handleUploadTrackImage}
                onClick={() => setDetailTrackIndex(index)}
              />
            ))}
          </Grid>
        </div>
      )}

      {/* Track detail modal */}
      <Modal
        open={detailTrackIndex !== null}
        onClose={() => setDetailTrackIndex(null)}
        size="3xl"
      >
        {detailTrack && (
          <div className="flex flex-col gap-[var(--spacing-4)]">
            {/* Header with navigation — simplified for single-track pipelines */}
            <div className="flex items-center gap-[var(--spacing-2)]">
              {!isSingleTrack && (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={detailTrackIndex === 0}
                  onClick={() => setDetailTrackIndex((i) => (i !== null && i > 0 ? i - 1 : i))}
                  icon={<ChevronLeft size={16} />}
                  aria-label="Previous track"
                />
              )}
              <h2 className={`text-sm font-semibold font-mono uppercase tracking-wide ${isSingleTrack ? "text-[var(--color-text-primary)]" : (TRACK_TEXT_COLORS[detailTrack.track.slug] ?? "text-[var(--color-text-primary)]")}`}>
                {isSingleTrack ? "Seed Image" : detailTrack.track.name}
              </h2>
              {!isSingleTrack && (
                <>
                  <span className="text-[10px] font-mono text-[var(--color-text-muted)]">
                    {(detailTrackIndex ?? 0) + 1}/{trackImageData.length}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={detailTrackIndex === trackImageData.length - 1}
                    onClick={() => setDetailTrackIndex((i) => (i !== null && i < trackImageData.length - 1 ? i + 1 : i))}
                    icon={<ChevronRight size={16} />}
                    aria-label="Next track"
                  />
                </>
              )}
            </div>

            {/* Seed image large preview */}
            <div className="flex justify-center bg-[var(--color-surface-secondary)] rounded-[var(--radius-md)]">
              {detailTrack.hero?.file_path ? (
                <img
                  src={variantMediaUrl(detailTrack.hero.file_path)}
                  alt={`${detailTrack.track.name} seed image`}
                  className="max-h-[40vh] rounded-[var(--radius-md)] object-contain"
                />
              ) : (
                <div className="flex h-48 w-full items-center justify-center text-[var(--color-text-muted)]">
                  No seed image
                </div>
              )}
            </div>

            {/* Seed image info + actions */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-mono text-[10px] text-[var(--color-text-muted)]">
                {detailTrack.hero && (
                  <>
                    <span className={statusBadgeVariant(detailTrack.hero.status_id) === "success" ? "text-green-400" : "text-cyan-400"}>
                      {MEDIA_VARIANT_STATUS_LABEL[detailTrack.hero.status_id]?.toLowerCase()}
                    </span>
                    <span className="opacity-30">|</span>
                    <span>{(PROVENANCE_LABEL[detailTrack.hero.provenance as Provenance] ?? detailTrack.hero.provenance).toLowerCase()}</span>
                    {detailTrack.hero.width && detailTrack.hero.height && (
                      <><span className="opacity-30">|</span><span>{detailTrack.hero.width}x{detailTrack.hero.height}</span></>
                    )}
                    {detailTrack.hero.format && (
                      <><span className="opacity-30">|</span><span>{detailTrack.hero.format.toUpperCase()}</span></>
                    )}
                  </>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="xs"
                  variant="secondary"
                  icon={<Upload size={12} />}
                  onClick={() => {
                    const input = document.createElement("input");
                    input.type = "file";
                    input.accept = "image/*";
                    input.onchange = (e) => {
                      const file = (e.target as HTMLInputElement).files?.[0];
                      if (file) handleUploadTrackImage(file, detailTrack.track.slug);
                    };
                    input.click();
                  }}
                >
                  Upload
                </Button>
                {detailTrack.track.slug.toLowerCase() === "clothed" && (
                  <Button
                    size="xs"
                    variant="secondary"
                    icon={<Wand2 size={12} />}
                    disabled={!toplessHeroExists || generating}
                    onClick={() => handleGenerateTrackImage(detailTrack.track.slug)}
                  >
                    {generating ? "Generating…" : "Generate"}
                  </Button>
                )}
                {detailTrack.hero && (
                  <Button
                    size="xs"
                    variant="danger"
                    icon={<Trash2 size={12} />}
                    onClick={() => handleDelete(detailTrack.hero!.id)}
                  >
                    Delete
                  </Button>
                )}
              </div>
            </div>

            {/* Variants for this track */}
            <div className="space-y-2">
              <h3 className="text-xs font-mono font-medium text-[var(--color-text-primary)]">
                Variants ({trackVariants.length})
              </h3>
              {variantsLoading ? (
                <div className="flex items-center justify-center py-4">
                  <ContextLoader size={48} />
                </div>
              ) : trackVariants.length === 0 ? (
                <p className="text-xs font-mono text-[var(--color-text-muted)] py-4 text-center">
                  No variants for this track yet.
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {trackVariants.map((v) => (
                    <ModalVariantCard
                      key={v.id}
                      variant={v}
                      onApprove={handleApprove}
                      onUnapprove={handleUnapprove}
                      onReject={handleReject}
                      onExport={handleExport}
                      onDelete={handleDelete}
                      onAnnotate={setAnnotatingVariant}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* Overwrite confirmation modal */}
      <Modal
        open={confirmGenerateTrack !== null}
        onClose={() => setConfirmGenerateTrack(null)}
        title="Replace manually managed image?"
        size="sm"
      >
        <p className="text-xs font-mono text-[var(--color-text-secondary)] mb-[var(--spacing-4)]">
          The existing image was manually uploaded. Generating will create a new
          variant (the existing image will not be deleted).
        </p>
        <div className="flex justify-end gap-2 pt-1 border-t border-[var(--color-border-default)]">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setConfirmGenerateTrack(null)}
          >
            Cancel
          </Button>
          <Button size="sm" onClick={handleConfirmedGenerate}>
            Generate anyway
          </Button>
        </div>
      </Modal>

      {/* Image variant annotation modal */}
      <MediaVariantAnnotationModal
        avatarId={avatarId}
        variant={annotatingVariant}
        onClose={() => setAnnotatingVariant(null)}
      />
    </Stack>
  );
}
