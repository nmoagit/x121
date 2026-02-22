/**
 * Tier indicator badge for storage items (PRD-48).
 *
 * Displays a small badge showing "Hot" or "Cold" storage tier,
 * with an optional "Retrieving..." state for cold-tier assets
 * being fetched on demand.
 */

import { Badge } from "@/components/primitives";

import type { BadgeVariant } from "@/components/primitives";

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface TierIndicatorProps {
  /** The storage tier: "hot" or "cold". */
  tier: "hot" | "cold";
  /** Whether the asset is currently being retrieved from cold storage. */
  isRetrieving?: boolean;
}

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

const TIER_CONFIG: Record<"hot" | "cold", { label: string; variant: BadgeVariant }> = {
  hot: { label: "Hot", variant: "success" },
  cold: { label: "Cold", variant: "info" },
};

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function TierIndicator({ tier, isRetrieving = false }: TierIndicatorProps) {
  const config = TIER_CONFIG[tier];

  if (isRetrieving) {
    return (
      <Badge variant="warning" size="sm">
        Retrieving...
      </Badge>
    );
  }

  return (
    <Badge variant={config.variant} size="sm">
      {config.label}
    </Badge>
  );
}
