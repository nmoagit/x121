/**
 * Tier indicator badge for storage items (PRD-48).
 *
 * Displays a small badge showing "Hot" or "Cold" storage tier,
 * with an optional "Retrieving..." state for cold-tier assets
 * being fetched on demand.
 */

import { Badge } from "@/components/primitives";

import type { BadgeVariant } from "@/components/primitives";
import type { StorageTier } from "./types";
import { TIER_LABELS } from "./types";

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface TierIndicatorProps {
  /** The storage tier: "hot" or "cold". */
  tier: StorageTier;
  /** Whether the asset is currently being retrieved from cold storage. */
  isRetrieving?: boolean;
}

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

const TIER_VARIANT: Record<StorageTier, BadgeVariant> = {
  hot: "success",
  cold: "info",
};

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function TierIndicator({ tier, isRetrieving = false }: TierIndicatorProps) {
  if (isRetrieving) {
    return (
      <Badge variant="warning" size="sm">
        Retrieving...
      </Badge>
    );
  }

  return (
    <Badge variant={TIER_VARIANT[tier]} size="sm">
      {TIER_LABELS[tier]}
    </Badge>
  );
}
