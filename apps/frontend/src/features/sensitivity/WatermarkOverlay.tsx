/**
 * Watermark overlay component (PRD-82).
 *
 * Renders a text watermark over its parent container.
 * Uses `pointer-events: none` so it doesn't interfere with interaction.
 */

import { cn } from "@/lib/cn";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface WatermarkOverlayProps {
  text?: string;
  position?: "center" | "corner";
  opacity?: number;
  className?: string;
}

/* --------------------------------------------------------------------------
   Position styles
   -------------------------------------------------------------------------- */

const POSITION_CLASSES = {
  center: "inset-0 flex items-center justify-center text-2xl -rotate-45",
  corner: "bottom-2 right-2 text-xs",
} as const;

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function WatermarkOverlay({
  text = "PREVIEW",
  position = "center",
  opacity = 0.3,
  className,
}: WatermarkOverlayProps) {
  return (
    <div
      data-testid="watermark-overlay"
      className={cn(
        "absolute pointer-events-none select-none",
        "text-[var(--color-text-muted)] font-semibold tracking-wider",
        POSITION_CLASSES[position],
        className,
      )}
      style={{ opacity }}
      aria-hidden="true"
    >
      {text}
    </div>
  );
}
