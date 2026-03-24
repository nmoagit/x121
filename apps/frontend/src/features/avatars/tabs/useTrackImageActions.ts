/**
 * Shared hook for track image generate/upload logic.
 *
 * Used by both AvatarImagesTab and AvatarScenesTab to avoid
 * duplicating the generate-with-overwrite-check and upload handlers.
 */

import { useMemo, useState } from "react";

import { useToast } from "@/components/composite/useToast";

import {
  useGenerateVariants,
  useMediaVariants,
  useUploadMediaVariant,
} from "@/features/media/hooks/use-media-variants";
import { PROVENANCE } from "@/features/media/types";
import type { MediaVariant } from "@/features/media/types";
import { findVariantForTrackWithFallback } from "@/features/media/utils";
import { usePipelineContextSafe } from "@/features/pipelines";
import { usePipeline } from "@/features/pipelines/hooks/use-pipelines";
import type { SeedSlot } from "@/features/pipelines/types";
import { useProject } from "@/features/projects/hooks/use-projects";
import { useTracks } from "@/features/scene-catalogue/hooks/use-tracks";
import type { Track } from "@/features/scene-catalogue/types";

interface TrackImageDatum {
  track: Track;
  hero: MediaVariant | null;
}

export function useTrackImageActions(avatarId: number, projectId?: number) {
  const pipelineCtx = usePipelineContextSafe();
  const { data: projectData } = useProject(projectId ?? 0);
  const resolvedPipelineId = pipelineCtx?.pipelineId ?? projectData?.pipeline_id ?? undefined;
  const { data: pipelineData } = usePipeline(resolvedPipelineId ?? 0);
  const { data: tracks } = useTracks(false, resolvedPipelineId);
  const { data: imageVariants } = useMediaVariants(avatarId);
  const generateVariants = useGenerateVariants(avatarId);
  const uploadVariant = useUploadMediaVariant(avatarId);
  const { addToast } = useToast();

  const [confirmGenerateTrack, setConfirmGenerateTrack] = useState<string | null>(null);

  const seedSlotNames = useMemo(() => {
    const slots = (pipelineData?.seed_slots ?? []) as SeedSlot[];
    return slots.map((s) => s.name.toLowerCase());
  }, [pipelineData?.seed_slots]);

  const isSingleTrack = useMemo(
    () => (tracks ?? []).filter((t) => t.is_active).length === 1,
    [tracks],
  );

  const activeTracks = useMemo(
    () =>
      (tracks ?? [])
        .filter((t) => t.is_active)
        .sort((a, b) => {
          if (a.slug === "topless" && b.slug !== "topless") return -1;
          if (b.slug === "topless" && a.slug !== "topless") return 1;
          return a.sort_order - b.sort_order;
        }),
    [tracks],
  );

  const trackImageData = useMemo<TrackImageDatum[]>(
    () =>
      activeTracks.map((track) => ({
        track,
        hero: imageVariants
          ? findVariantForTrackWithFallback(imageVariants, track.slug, seedSlotNames, isSingleTrack) ?? null
          : null,
      })),
    [activeTracks, imageVariants, isSingleTrack, seedSlotNames],
  );

  const toplessHeroExists = useMemo(
    () => (imageVariants ? findVariantForTrackWithFallback(imageVariants, "topless", seedSlotNames, false) !== undefined : false),
    [imageVariants, seedSlotNames],
  );

  function handleGenerateTrackImage(trackSlug: string) {
    const existing = imageVariants ? findVariantForTrackWithFallback(imageVariants, trackSlug, seedSlotNames, isSingleTrack) : undefined;
    const isManual =
      existing?.provenance === PROVENANCE.MANUAL_UPLOAD ||
      existing?.provenance === PROVENANCE.MANUALLY_EDITED;

    if (existing && isManual) {
      setConfirmGenerateTrack(trackSlug);
    } else {
      generateVariants.mutate({ variant_type: trackSlug });
    }
  }

  function handleConfirmedGenerate() {
    if (confirmGenerateTrack) {
      generateVariants.mutate({ variant_type: confirmGenerateTrack });
      setConfirmGenerateTrack(null);
    }
  }

  function handleUploadTrackImage(file: File, trackSlug: string) {
    uploadVariant.mutate(
      { file, variant_type: trackSlug },
      {
        onSuccess: () => {
          addToast({ message: "Image uploaded successfully", variant: "success" });
        },
        onError: (err) => {
          addToast({
            message: err instanceof Error ? err.message : "Upload failed",
            variant: "error",
          });
        },
      },
    );
  }

  return {
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
    generating: generateVariants.isPending,
  };
}
