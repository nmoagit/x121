/**
 * Badge showing the derived status of a shared link (PRD-84).
 */

import { Badge } from "@/components/primitives";
import type { BadgeVariant } from "@/components/primitives";

import {
  deriveLinkStatus,
  LINK_STATUS_BADGE_VARIANT,
  LINK_STATUS_LABELS,
} from "./types";
import type { LinkStatus, SharedLink } from "./types";

interface LinkStatusBadgeProps {
  /** Either a full link (auto-derives status) or a pre-computed status. */
  link?: SharedLink;
  status?: LinkStatus;
}

export function LinkStatusBadge({ link, status: statusProp }: LinkStatusBadgeProps) {
  const status = statusProp ?? (link ? deriveLinkStatus(link) : "active");

  return (
    <Badge
      variant={LINK_STATUS_BADGE_VARIANT[status] as BadgeVariant}
      size="sm"
    >
      {LINK_STATUS_LABELS[status]}
    </Badge>
  );
}
