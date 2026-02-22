/**
 * Boundary frame scrubber for manual frame selection (PRD-24).
 *
 * Shows the final N frame thumbnails of a segment and allows the user
 * to click one to set it as the boundary frame for the next segment.
 */

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface BoundaryFrameScrubberProps {
  /** URLs of the candidate frame thumbnails (ordered by index). */
  frameThumbnails: string[];
  /** Currently selected frame index (0-based within the thumbnails array). */
  selectedIndex: number | null;
  /** Called when the user clicks a frame thumbnail. */
  onSelectFrame: (frameIndex: number) => void;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function BoundaryFrameScrubber({
  frameThumbnails,
  selectedIndex,
  onSelectFrame,
}: BoundaryFrameScrubberProps) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-[var(--color-text-secondary)]">
        Select boundary frame
      </span>

      <div className="flex gap-1 overflow-x-auto" role="listbox" aria-label="Boundary frames">
        {frameThumbnails.map((url, index) => {
          const isSelected = selectedIndex === index;

          return (
            <button
              key={index}
              type="button"
              role="option"
              aria-selected={isSelected}
              aria-label={`Frame ${index}`}
              className={`
                relative flex-shrink-0 w-16 h-12 rounded border-2 overflow-hidden
                cursor-pointer transition-all
                ${
                  isSelected
                    ? "border-[var(--color-primary)] ring-2 ring-[var(--color-primary)]/30"
                    : "border-transparent hover:border-[var(--color-border-hover)]"
                }
              `}
              onClick={() => onSelectFrame(index)}
              data-testid={`frame-thumb-${index}`}
            >
              <img
                src={url}
                alt={`Frame ${index}`}
                className="w-full h-full object-cover"
              />

              {/* Frame index label */}
              <span
                className="absolute bottom-0 right-0 px-1 text-[10px] leading-tight
                           bg-black/60 text-white rounded-tl"
                data-testid={`frame-label-${index}`}
              >
                {index}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
