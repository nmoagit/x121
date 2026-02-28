/**
 * Compact compliance badge showing pass/fail/pending state (PRD-102).
 *
 * Reusable for decorating scene lists or inline status indicators.
 */

import { Badge } from "@/components/primitives";

import type { ComplianceState } from "./types";
import { COMPLIANCE_STATE_BADGE_VARIANT, COMPLIANCE_STATE_LABELS } from "./types";

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

interface ComplianceBadgeProps {
  state: ComplianceState;
}

export function ComplianceBadge({ state }: ComplianceBadgeProps) {
  return (
    <span data-testid={`compliance-badge-${state}`}>
      <Badge variant={COMPLIANCE_STATE_BADGE_VARIANT[state]} size="sm">
        {COMPLIANCE_STATE_LABELS[state]}
      </Badge>
    </span>
  );
}
