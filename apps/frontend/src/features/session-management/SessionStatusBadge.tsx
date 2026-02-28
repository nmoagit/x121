/**
 * Session status badge component (PRD-98).
 *
 * Renders a Badge with the correct variant colour for a session status:
 * active=green, idle=yellow, terminated=neutral.
 */

import { Badge } from "@/components/primitives";

import { SESSION_STATUS_BADGE, SESSION_STATUS_LABEL } from "./types";

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface SessionStatusBadgeProps {
  status: string;
  size?: "sm" | "md";
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function SessionStatusBadge({ status, size = "sm" }: SessionStatusBadgeProps) {
  return (
    <Badge variant={SESSION_STATUS_BADGE[status] ?? "default"} size={size}>
      {SESSION_STATUS_LABEL[status] ?? status}
    </Badge>
  );
}
