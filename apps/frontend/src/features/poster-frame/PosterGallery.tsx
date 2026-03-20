/**
 * Poster frame gallery grid (PRD-96).
 *
 * Displays all character poster frames for a project in a grid layout,
 * with an option to auto-select the best frame for each character.
 */

import { Badge, Button ,  WireframeLoader } from "@/components/primitives";
import { cn } from "@/lib/cn";

import {
  useAutoSelectPosters,
  usePosterGallery,
} from "./hooks/use-poster-frame";
import type { PosterFrame } from "./types";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface PosterGalleryProps {
  projectId: number;
  /** Callback when a poster card is clicked for re-selection. */
  onPosterClick?: (posterFrame: PosterFrame) => void;
  className?: string;
}

/* --------------------------------------------------------------------------
   Sub-components
   -------------------------------------------------------------------------- */

function PosterCard({
  posterFrame,
  onClick,
}: {
  posterFrame: PosterFrame;
  onClick?: (posterFrame: PosterFrame) => void;
}) {
  return (
    <button
      type="button"
      data-testid="poster-card"
      className={cn(
        "group relative overflow-hidden rounded-[var(--radius-md)]",
        "border border-[var(--color-border-default)]",
        "transition-shadow duration-[var(--duration-fast)]",
        "hover:shadow-md focus-visible:outline-2 focus-visible:outline-[var(--color-border-focus)]",
      )}
      onClick={() => onClick?.(posterFrame)}
    >
      <img
        src={posterFrame.image_path}
        alt={`Poster for ${posterFrame.entity_type} ${posterFrame.entity_id}`}
        className="aspect-video w-full object-cover"
      />

      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-white">
            Frame {posterFrame.frame_number}
          </span>
          <Badge variant="info" size="sm">
            Manual
          </Badge>
        </div>
      </div>
    </button>
  );
}

function EmptyState({ onAutoSelect }: { onAutoSelect: () => void }) {
  return (
    <div
      data-testid="poster-gallery-empty"
      className={cn(
        "flex flex-col items-center justify-center gap-4 py-16",
        "rounded-[var(--radius-md)] border border-dashed border-[var(--color-border-subtle)]",
      )}
    >
      <p className="text-sm text-[var(--color-text-muted)]">
        No poster frames have been set yet.
      </p>
      <Button variant="secondary" size="sm" onClick={onAutoSelect}>
        Auto-select best frames
      </Button>
    </div>
  );
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function PosterGallery({
  projectId,
  onPosterClick,
  className,
}: PosterGalleryProps) {
  const { data: posters, isLoading } = usePosterGallery(projectId);
  const autoSelect = useAutoSelectPosters();

  const handleAutoSelect = () => {
    autoSelect.mutate(projectId);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <WireframeLoader size={48} />
      </div>
    );
  }

  const posterList = posters ?? [];

  if (posterList.length === 0) {
    return <EmptyState onAutoSelect={handleAutoSelect} />;
  }

  return (
    <div data-testid="poster-gallery" className={cn("space-y-4", className)}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-[var(--color-text-primary)]">
          Poster Frames ({posterList.length})
        </h3>
        <Button
          data-testid="auto-select-button"
          variant="secondary"
          size="sm"
          loading={autoSelect.isPending}
          onClick={handleAutoSelect}
        >
          Auto-select best frames
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {posterList.map((poster) => (
          <PosterCard
            key={poster.id}
            posterFrame={poster}
            onClick={onPosterClick}
          />
        ))}
      </div>
    </div>
  );
}
