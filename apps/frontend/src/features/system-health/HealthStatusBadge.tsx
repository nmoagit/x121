/**
 * Health status badge component (PRD-80).
 *
 * Renders a Badge with the correct variant colour for a health status value:
 * healthy=green, degraded=yellow, down=red.
 */

import { Badge } from "@/components/primitives";

import type { HealthStatus } from "./types";
import { HEALTH_STATUS_BADGE_VARIANT, HEALTH_STATUS_LABELS } from "./types";

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface HealthStatusBadgeProps {
  status: HealthStatus;
  size?: "sm" | "md";
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function HealthStatusBadge({ status, size = "sm" }: HealthStatusBadgeProps) {
  return (
    <Badge variant={HEALTH_STATUS_BADGE_VARIANT[status]} size={size}>
      {HEALTH_STATUS_LABELS[status]}
    </Badge>
  );
}
