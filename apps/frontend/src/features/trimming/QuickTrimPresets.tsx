/**
 * Quick trim preset buttons for common trimming operations (PRD-78).
 *
 * Displays a grid of one-click preset buttons (e.g. "First 5 frames",
 * "Last 10 frames"). Presets that would exceed the available frame count
 * are automatically disabled.
 */

import { TRIM_PRESETS } from "./types";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface QuickTrimPresetsProps {
  /** Segment ID for test identification. */
  segmentId: number;
  /** Total frames in the original segment. */
  totalFrames: number;
  /** Callback fired when a preset is applied. */
  onApply: (inFrame: number, outFrame: number) => void;
}

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

/** Compute the (inFrame, outFrame) pair for a preset. */
function computePresetRange(
  preset: (typeof TRIM_PRESETS)[number],
  totalFrames: number,
): [number, number] {
  if (preset.value.startsWith("first_")) {
    return [0, Math.min(preset.frames, totalFrames)];
  }
  // last_N
  return [Math.max(0, totalFrames - preset.frames), totalFrames];
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function QuickTrimPresets({
  segmentId,
  totalFrames,
  onApply,
}: QuickTrimPresetsProps) {
  return (
    <div
      data-testid={`quick-trim-presets-${segmentId}`}
      className="space-y-2"
    >
      <h4 className="text-sm font-medium text-[var(--color-text-primary)]">
        Quick Trim Presets
      </h4>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {TRIM_PRESETS.map((preset) => {
          const isDisabled = preset.frames > totalFrames;
          const [inFrame, outFrame] = computePresetRange(preset, totalFrames);
          const resultFrames = outFrame - inFrame;

          return (
            <button
              key={preset.value}
              data-testid={`preset-${preset.value}`}
              type="button"
              disabled={isDisabled}
              onClick={() => onApply(inFrame, outFrame)}
              className="rounded border border-[var(--color-border-subtle)] px-3 py-2 text-left text-sm transition-colors hover:bg-[var(--color-surface-secondary)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <div className="font-medium text-[var(--color-text-primary)]">
                {preset.label}
              </div>
              <div className="text-xs text-[var(--color-text-secondary)]">
                {isDisabled
                  ? "Not enough frames"
                  : `${resultFrames} frames kept`}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
