/**
 * Lifecycle state badge component (PRD-72).
 *
 * Displays a color-coded badge for the current project lifecycle state.
 */

import { Badge } from "@/components/primitives";

import {
  LIFECYCLE_STATE_BADGE_VARIANT,
  LIFECYCLE_STATE_LABELS,
  type LifecycleState,
} from "./types";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface LifecycleStateBadgeProps {
  /** The lifecycle state to display. */
  state: LifecycleState;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function LifecycleStateBadge({ state }: LifecycleStateBadgeProps) {
  const label = LIFECYCLE_STATE_LABELS[state];
  const variant = LIFECYCLE_STATE_BADGE_VARIANT[state];

  return (
    <span data-testid="lifecycle-state-badge">
      <Badge variant={variant} size="sm">
        {label}
      </Badge>
    </span>
  );
}
