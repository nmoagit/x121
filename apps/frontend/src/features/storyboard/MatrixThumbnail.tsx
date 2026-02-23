/**
 * Matrix thumbnail component for scene grid cells (PRD-62).
 *
 * Shows the first keyframe of a scene as a poster image for matrix cells.
 * Can toggle between thumbnail mode and status-only display. Supports
 * compact mode for dense grid layouts.
 */

import { useSceneStoryboard } from "./hooks/use-storyboard";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface MatrixThumbnailProps {
  /** Scene ID to fetch the poster keyframe for. */
  sceneId: number;
  /** Whether to show the thumbnail image or status-only text. */
  showThumbnail: boolean;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function MatrixThumbnail({
  sceneId,
  showThumbnail,
}: MatrixThumbnailProps) {
  const { data: keyframes, isLoading } = useSceneStoryboard(sceneId);

  const poster = keyframes?.[0] ?? null;

  if (!showThumbnail) {
    return (
      <div
        data-testid={`matrix-thumb-${sceneId}`}
        className="flex h-16 items-center justify-center rounded bg-[var(--color-surface-tertiary)] text-xs text-[var(--color-text-muted)]"
      >
        Scene {sceneId}
      </div>
    );
  }

  if (isLoading) {
    return (
      <div
        data-testid={`matrix-thumb-${sceneId}`}
        className="h-16 animate-pulse rounded bg-[var(--color-surface-tertiary)]"
      />
    );
  }

  if (!poster) {
    return (
      <div
        data-testid={`matrix-thumb-${sceneId}`}
        className="flex h-16 items-center justify-center rounded bg-[var(--color-surface-tertiary)] text-xs text-[var(--color-text-muted)]"
      >
        No poster
      </div>
    );
  }

  return (
    <div
      data-testid={`matrix-thumb-${sceneId}`}
      className="overflow-hidden rounded"
    >
      <img
        data-testid={`matrix-poster-${sceneId}`}
        src={poster.thumbnail_path}
        alt={`Scene ${sceneId} poster`}
        className="h-16 w-full object-cover"
      />
    </div>
  );
}
