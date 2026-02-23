/**
 * Readiness state badge component (PRD-107).
 *
 * Displays a color-coded badge for a character's readiness state,
 * with a tooltip showing missing items when hovered.
 */

import { Badge, Tooltip } from "@/components";

import type { ReadinessState } from "./types";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface ReadinessStateBadgeProps {
  /** The readiness state to display. */
  state: ReadinessState;
  /** List of missing item labels. */
  missingItems?: string[];
}

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

const STATE_LABELS: Record<ReadinessState, string> = {
  ready: "Ready",
  partially_ready: "Partially Ready",
  not_started: "Not Started",
};

const STATE_VARIANTS: Record<ReadinessState, "success" | "warning" | "danger"> = {
  ready: "success",
  partially_ready: "warning",
  not_started: "danger",
};

function formatMissingItem(item: string): string {
  return item.replace(/_/g, " ");
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function ReadinessStateBadge({
  state,
  missingItems = [],
}: ReadinessStateBadgeProps) {
  const label = STATE_LABELS[state];
  const variant = STATE_VARIANTS[state];

  const badge = (
    <span data-testid={`readiness-badge-${state}`}>
      <Badge variant={variant} size="sm">
        {label}
      </Badge>
    </span>
  );

  if (missingItems.length === 0) {
    return badge;
  }

  const tooltipContent = (
    <span data-testid="missing-items-tooltip">
      Missing: {missingItems.map(formatMissingItem).join(", ")}
    </span>
  );

  return (
    <Tooltip content={tooltipContent} side="bottom">
      {badge}
    </Tooltip>
  );
}
