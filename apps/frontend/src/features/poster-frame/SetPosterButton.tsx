/**
 * Set Poster Frame button (PRD-96).
 *
 * Captures the current video frame and sets it as the poster frame
 * for a avatar or scene entity.
 */

import { useCallback } from "react";

import { Button } from "@/components/primitives";

import { useSetAvatarPoster, useSetScenePoster } from "./hooks/use-poster-frame";
import type { UpsertPosterFrame } from "./types";
import { ENTITY_TYPE_CHARACTER } from "./types";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface SetPosterButtonProps {
  entityType: "avatar" | "scene";
  entityId: number;
  segmentId: number;
  /** Current frame number from the video player. */
  currentFrame: number;
  onSuccess?: () => void;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function SetPosterButton({
  entityType,
  entityId,
  segmentId,
  currentFrame,
  onSuccess,
}: SetPosterButtonProps) {
  const setAvatarPoster = useSetAvatarPoster();
  const setScenePoster = useSetScenePoster();

  const isLoading =
    setAvatarPoster.isPending || setScenePoster.isPending;

  const handleClick = useCallback(() => {
    const imagePath = `/storage/posters/${entityType}/${entityId}.jpg`;

    const body: UpsertPosterFrame = {
      segment_id: segmentId,
      frame_number: currentFrame,
      image_path: imagePath,
    };

    if (entityType === ENTITY_TYPE_CHARACTER) {
      setAvatarPoster.mutate(
        { avatarId: entityId, body },
        { onSuccess },
      );
    } else {
      setScenePoster.mutate(
        { sceneId: entityId, body },
        { onSuccess },
      );
    }
  }, [
    entityType,
    entityId,
    segmentId,
    currentFrame,
    onSuccess,
    setAvatarPoster,
    setScenePoster,
  ]);

  return (
    <Button
      data-testid="set-poster-button"
      variant="secondary"
      size="sm"
      loading={isLoading}
      onClick={handleClick}
    >
      Set as Poster
    </Button>
  );
}
