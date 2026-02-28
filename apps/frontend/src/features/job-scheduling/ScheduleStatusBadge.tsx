/**
 * Schedule active/paused status badge (PRD-119).
 *
 * Displays a colored badge indicating whether a schedule is active or paused.
 */

import { Badge } from "@/components/primitives";

interface ScheduleStatusBadgeProps {
  isActive: boolean;
}

export function ScheduleStatusBadge({ isActive }: ScheduleStatusBadgeProps) {
  return (
    <Badge variant={isActive ? "success" : "default"} size="sm">
      {isActive ? "Active" : "Paused"}
    </Badge>
  );
}
