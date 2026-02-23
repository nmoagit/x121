/**
 * BoundaryQualityIndicator — displays SSIM quality at segment boundaries (PRD-25).
 *
 * Shows a compact indicator with traffic-light color coding based on SSIM
 * threshold. Provides a smoothing action button when quality is "discontinuity".
 */

import { Badge, Button } from "@/components/primitives";
import { cn } from "@/lib/cn";

import type { BoundaryQuality } from "./types";
import {
  classifyBoundaryQuality,
  qualityBadgeVariant,
  qualityColor,
} from "./types";

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface BoundaryQualityIndicatorProps {
  /** SSIM score at the "before" boundary (previous segment -> this segment). */
  ssimBefore: number | null;
  /** SSIM score at the "after" boundary (this segment -> next segment). */
  ssimAfter: number | null;
  /** SSIM threshold for discontinuity detection. */
  threshold?: number;
  /** Callback when user requests smoothing at a boundary. */
  onRequestSmoothing?: (boundary: "before" | "after") => void;
}

/* --------------------------------------------------------------------------
   Boundary indicator sub-component
   -------------------------------------------------------------------------- */

function BoundaryScore({
  label,
  ssim,
  quality,
  boundary,
  onRequestSmoothing,
}: {
  label: string;
  ssim: number;
  quality: BoundaryQuality;
  boundary: "before" | "after";
  onRequestSmoothing?: (boundary: "before" | "after") => void;
}) {
  return (
    <div
      data-testid={`boundary-${boundary}`}
      className="flex items-center justify-between gap-3"
    >
      <div className="flex items-center gap-2 min-w-0">
        <span
          className="inline-block w-2.5 h-2.5 rounded-[var(--radius-full)]"
          style={{ backgroundColor: qualityColor(quality) }}
          aria-label={`Boundary ${label}: ${quality}`}
        />
        <span className="text-sm text-[var(--color-text-secondary)]">
          {label}
        </span>
        <span className="text-sm tabular-nums text-[var(--color-text-primary)] font-medium">
          {ssim.toFixed(3)}
        </span>
        <Badge variant={qualityBadgeVariant(quality)} size="sm">
          {quality}
        </Badge>
      </div>
      {quality === "discontinuity" && onRequestSmoothing && (
        <Button
          data-testid={`smooth-${boundary}-btn`}
          variant="secondary"
          size="sm"
          onClick={() => onRequestSmoothing(boundary)}
        >
          Smooth
        </Button>
      )}
    </div>
  );
}

/* --------------------------------------------------------------------------
   Main component
   -------------------------------------------------------------------------- */

export function BoundaryQualityIndicator({
  ssimBefore,
  ssimAfter,
  threshold,
  onRequestSmoothing,
}: BoundaryQualityIndicatorProps) {
  const hasBefore = ssimBefore !== null;
  const hasAfter = ssimAfter !== null;

  if (!hasBefore && !hasAfter) {
    return (
      <p className="text-sm text-[var(--color-text-muted)]">
        No boundary SSIM data available.
      </p>
    );
  }

  return (
    <div
      data-testid="boundary-quality-indicator"
      className={cn("flex flex-col gap-2")}
    >
      {hasBefore && (
        <BoundaryScore
          label="Before"
          ssim={ssimBefore}
          quality={classifyBoundaryQuality(ssimBefore, threshold)}
          boundary="before"
          onRequestSmoothing={onRequestSmoothing}
        />
      )}
      {hasAfter && (
        <BoundaryScore
          label="After"
          ssim={ssimAfter}
          quality={classifyBoundaryQuality(ssimAfter, threshold)}
          boundary="after"
          onRequestSmoothing={onRequestSmoothing}
        />
      )}
    </div>
  );
}
