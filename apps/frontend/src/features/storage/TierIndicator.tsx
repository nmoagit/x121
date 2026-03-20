/**
 * Tier indicator for storage items (PRD-48).
 *
 * Displays a monospace colored label showing "HOT" or "COLD" storage tier,
 * with an optional "RETRIEVING..." state for cold-tier assets
 * being fetched on demand.
 */

import type { StorageTier } from "./types";
import { TIER_LABELS } from "./types";

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

const TIER_COLOR: Record<StorageTier, string> = {
  hot: "text-green-400",
  cold: "text-cyan-400",
};

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
   Component
   -------------------------------------------------------------------------- */

export function TierIndicator({ tier, isRetrieving = false }: TierIndicatorProps) {
  if (isRetrieving) {
    return (
      <span className="font-mono text-[10px] uppercase tracking-wide text-orange-400">
        Retrieving...
      </span>
    );
  }

  return (
    <span className={`font-mono text-[10px] uppercase tracking-wide ${TIER_COLOR[tier]}`}>
      {TIER_LABELS[tier]}
    </span>
  );
}
