/**
 * Verdict badge for regression test results (PRD-65).
 *
 * Maps a verdict to the corresponding Badge variant and label
 * from the design system primitives.
 */

import { Badge } from "@/components/primitives";

import type { Verdict } from "./types";
import { VERDICT_BADGE_VARIANTS, VERDICT_LABELS } from "./types";

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface VerdictBadgeProps {
  verdict: Verdict;
  className?: string;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function VerdictBadge({ verdict, className }: VerdictBadgeProps) {
  const variant = VERDICT_BADGE_VARIANTS[verdict];

  return (
    <span data-testid="verdict-badge" className={className}>
      <Badge variant={variant} size="sm">
        {VERDICT_LABELS[verdict]}
      </Badge>
    </span>
  );
}
