/**
 * Toggle-able SSIM difference overlay for the new version video (PRD-101).
 *
 * Provides two sub-components:
 * - `DiffOverlayToggle`: Button to toggle the overlay on/off.
 * - `DiffOverlayPanel`: The semi-transparent heatmap placeholder that
 *   renders inside the video container via absolute positioning.
 *
 * Actual SSIM heatmap generation is server-side and deferred to a future
 * iteration.
 */

import { Button } from "@/components/primitives";
import { cn } from "@/lib/cn";
import { Eye, EyeOff } from "@/tokens/icons";
import { TYPO_INPUT_LABEL } from "@/lib/typography-tokens";

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface DiffOverlayToggleProps {
  enabled: boolean;
  onToggle: () => void;
}

interface DiffOverlayPanelProps {
  enabled: boolean;
}

/* --------------------------------------------------------------------------
   Components
   -------------------------------------------------------------------------- */

/** Button that toggles the diff overlay visibility. */
export function DiffOverlayToggle({ enabled, onToggle }: DiffOverlayToggleProps) {
  return (
    <Button
      variant="ghost"
      size="sm"
      icon={enabled ? <EyeOff size={16} /> : <Eye size={16} />}
      onClick={onToggle}
      data-testid="diff-overlay-toggle"
    >
      {enabled ? "Hide Diff" : "Show Diff"}
    </Button>
  );
}

/** Semi-transparent overlay rendered inside a video container. */
export function DiffOverlayPanel({ enabled }: DiffOverlayPanelProps) {
  if (!enabled) return null;

  return (
    <div
      data-testid="diff-overlay"
      className={cn(
        "absolute inset-0 pointer-events-none",
        "bg-gradient-to-br from-[var(--color-action-warning)]/20 to-[var(--color-action-danger)]/10",
        "flex items-center justify-center",
      )}
    >
      <span className={`bg-[var(--color-surface-primary)]/80 px-2 py-1 rounded-[var(--radius-sm)] ${TYPO_INPUT_LABEL}`}>
        SSIM Diff (placeholder)
      </span>
    </div>
  );
}

/**
 * Combined component for backward compatibility.
 * @deprecated Use `DiffOverlayToggle` and `DiffOverlayPanel` separately.
 */
export function DiffOverlay({ enabled, onToggle }: DiffOverlayToggleProps) {
  return (
    <>
      <DiffOverlayToggle enabled={enabled} onToggle={onToggle} />
      <DiffOverlayPanel enabled={enabled} />
    </>
  );
}
