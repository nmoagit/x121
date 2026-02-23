/**
 * Trim preview panel showing frame count, duration, and keep percentage (PRD-78).
 *
 * Displays a summary of the current trim operation including how many frames
 * are being kept, the resulting duration, and a warning when more than 50%
 * of the segment is being removed.
 */

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface TrimPreviewProps {
  /** Segment ID for test identification. */
  segmentId: number;
  /** Trim in-point (first frame to keep). */
  inFrame: number;
  /** Trim out-point (first frame after the kept range). */
  outFrame: number;
  /** Total frames in the original segment. */
  totalFrames: number;
  /** Segment framerate in fps, used for duration calculation. */
  framerate?: number;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function TrimPreview({
  segmentId,
  inFrame,
  outFrame,
  totalFrames,
  framerate = 24,
}: TrimPreviewProps) {
  const keptFrames = outFrame - inFrame;
  const removedFrames = totalFrames - keptFrames;
  const keepPercent =
    totalFrames > 0 ? Math.round((keptFrames / totalFrames) * 100) : 100;
  const durationSecs = framerate > 0 ? keptFrames / framerate : 0;
  const isAggressive = keepPercent < 50;

  return (
    <div
      data-testid={`trim-preview-${segmentId}`}
      className="space-y-3 rounded border border-[var(--color-border-subtle)] p-4"
    >
      <h4 className="text-sm font-medium text-[var(--color-text-primary)]">
        Trim Preview
      </h4>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 text-sm">
        <div>
          <div className="text-[var(--color-text-secondary)]">Kept</div>
          <div
            data-testid="kept-frames"
            className="font-medium text-[var(--color-text-primary)]"
          >
            {keptFrames} frames
          </div>
        </div>
        <div>
          <div className="text-[var(--color-text-secondary)]">Duration</div>
          <div
            data-testid="trim-duration"
            className="font-medium text-[var(--color-text-primary)]"
          >
            {durationSecs.toFixed(2)}s
          </div>
        </div>
        <div>
          <div className="text-[var(--color-text-secondary)]">Keeping</div>
          <div
            data-testid="keep-percent"
            className="font-medium text-[var(--color-text-primary)]"
          >
            {keepPercent}%
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-2 w-full overflow-hidden rounded bg-[var(--color-surface-tertiary)]">
        <div
          data-testid="keep-bar"
          className={`h-full rounded ${isAggressive ? "bg-amber-500" : "bg-green-500"}`}
          style={{ width: `${keepPercent}%` }}
        />
      </div>

      {/* Aggressive trim warning */}
      {isAggressive && (
        <div
          data-testid="aggressive-warning"
          className="rounded bg-amber-500/10 p-2 text-xs text-amber-600"
        >
          Warning: This trim removes {removedFrames} frames ({100 - keepPercent}%
          of the original segment).
        </div>
      )}
    </div>
  );
}
