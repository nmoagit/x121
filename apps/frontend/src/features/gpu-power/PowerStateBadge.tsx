/**
 * Badge displaying a worker's current power state with color coding (PRD-87).
 */

import { Badge } from "@/components/primitives";

import type { PowerState } from "./types";
import { POWER_STATE_BADGE_VARIANT, POWER_STATE_LABELS } from "./types";

interface PowerStateBadgeProps {
  state: PowerState;
  size?: "sm" | "md";
}

export function PowerStateBadge({ state, size = "sm" }: PowerStateBadgeProps) {
  return (
    <Badge variant={POWER_STATE_BADGE_VARIANT[state]} size={size}>
      {POWER_STATE_LABELS[state]}
    </Badge>
  );
}
