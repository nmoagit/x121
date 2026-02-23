/**
 * TierBadge component for the Multi-Resolution Pipeline (PRD-59).
 *
 * Displays the tier name in a color-coded badge:
 * - Draft: gray (default)
 * - Preview: amber (warning)
 * - Production: green (success)
 */

import { Badge } from "@/components/primitives/Badge";

import { TIER_LABELS, tierBadgeVariant } from "./types";

interface TierBadgeProps {
  /** The tier name (e.g. "draft", "preview", "production"). */
  tierName: string;
  /** Badge size. */
  size?: "sm" | "md";
}

export function TierBadge({ tierName, size = "sm" }: TierBadgeProps) {
  const label = TIER_LABELS[tierName] ?? tierName;
  const variant = tierBadgeVariant(tierName);

  return (
    <Badge variant={variant} size={size}>
      {label}
    </Badge>
  );
}
