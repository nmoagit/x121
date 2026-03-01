/**
 * Shared hook for track image generate/upload logic.
 *
 * Used by both CharacterImagesTab and CharacterScenesTab to avoid
 * duplicating the generate-with-overwrite-check and upload handlers.
 */

import { useMemo, useState } from "react";

import { useToast } from "@/components/composite/useToast";

import {
  useGenerateVariants,
  useImageVariants,
  useUploadImageVariant,
} from "@/features/images/hooks/use-image-variants";
import { PROVENANCE } from "@/features/images/types";
import type { ImageVariant } from "@/features/images/types";
import { findVariantForTrack } from "@/features/images/utils";
import { useTracks } from "@/features/scene-catalog/hooks/use-tracks";
import type { Track } from "@/features/scene-catalog/types";

interface TrackImageDatum {
  track: Track;
  hero: ImageVariant | null;
}

export function useTrackImageActions(characterId: number) {
  const { data: tracks } = useTracks();
  const { data: imageVariants } = useImageVariants(characterId);
  const generateVariants = useGenerateVariants(characterId);
  const uploadVariant = useUploadImageVariant(characterId);
  const { addToast } = useToast();

  const [confirmGenerateTrack, setConfirmGenerateTrack] = useState<string | null>(null);

  const activeTracks = useMemo(
    () =>
      (tracks ?? [])
        .filter((t) => t.is_active)
        .sort((a, b) => {
          // topless before clothed, rest by sort_order
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
        hero: imageVariants ? findVariantForTrack(imageVariants, track.slug) ?? null : null,
      })),
    [activeTracks, imageVariants],
  );

  const toplessHeroExists = useMemo(
    () => (imageVariants ? findVariantForTrack(imageVariants, "topless") !== undefined : false),
    [imageVariants],
  );

  function handleGenerateTrackImage(trackSlug: string) {
    const existing = imageVariants ? findVariantForTrack(imageVariants, trackSlug) : undefined;
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
    confirmGenerateTrack,
    setConfirmGenerateTrack,
    handleGenerateTrackImage,
    handleConfirmedGenerate,
    handleUploadTrackImage,
    generating: generateVariants.isPending,
  };
}
