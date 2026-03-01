/**
 * Character images tab — track seed image cards + variant gallery (PRD-112).
 *
 * Shows a card per active track with hero image preview, upload button, and
 * clothed-from-topless generation. Below the cards, the full variant gallery
 * is shown for detailed variant management.
 */

import { Modal } from "@/components/composite/Modal";
import { Grid, Stack } from "@/components/layout";
import { Button } from "@/components/primitives";

import { VariantGallery } from "@/features/images/VariantGallery";

import { TrackImageCard } from "./TrackImageCard";
import { useTrackImageActions } from "./useTrackImageActions";

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

interface CharacterImagesTabProps {
  characterId: number;
}

export function CharacterImagesTab({ characterId }: CharacterImagesTabProps) {
  const {
    activeTracks,
    trackImageData,
    toplessHeroExists,
    confirmGenerateTrack,
    setConfirmGenerateTrack,
    handleGenerateTrackImage,
    handleConfirmedGenerate,
    handleUploadTrackImage,
    generating,
  } = useTrackImageActions(characterId);

  return (
    <Stack gap={6}>
      {/* Track seed image cards */}
      {activeTracks.length > 0 && (
        <div className="space-y-[var(--spacing-2)]">
          <h3 className="text-sm font-medium text-[var(--color-text-muted)]">Seed Images</h3>
          <Grid cols={4} gap={4}>
            {trackImageData.map(({ track, hero }) => (
              <TrackImageCard
                key={track.id}
                track={track}
                heroVariant={hero}
                canGenerate={track.slug.toLowerCase() === "clothed"}
                generateEnabled={toplessHeroExists}
                generateDisabledReason={
                  !toplessHeroExists ? "Upload a topless hero image first" : null
                }
                onGenerate={() => handleGenerateTrackImage(track.slug)}
                generating={generating}
                onUpload={handleUploadTrackImage}
              />
            ))}
          </Grid>
        </div>
      )}

      {/* Full variant gallery */}
      <VariantGallery characterId={characterId} />

      {/* Overwrite confirmation modal */}
      <Modal
        open={confirmGenerateTrack !== null}
        onClose={() => setConfirmGenerateTrack(null)}
        title="Replace manually managed image?"
        size="sm"
      >
        <p className="text-sm text-[var(--color-text-secondary)] mb-[var(--spacing-4)]">
          The existing image was manually uploaded. Generating will create a new
          variant (the existing image will not be deleted).
        </p>
        <div className="flex justify-end gap-[var(--spacing-2)]">
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
    </Stack>
  );
}
