/**
 * Stat badge primitive -- displays a label/value pair inside a flat card.
 *
 * Used for summary statistics in dashboards (worker pool, GPU power,
 * consumption, etc.). Extracted as a shared component to avoid duplication
 * across feature modules (DRY audit HIGH-4).
 */

import { Card } from "@/components/composite/Card";

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

export interface StatBadgeProps {
  /** Short descriptor shown above the value. */
  label: string;
  /** The statistic value (number or pre-formatted string). */
  value: string | number;
  /** Optional extra CSS classes on the outer card. */
  className?: string;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function StatBadge({ label, value, className }: StatBadgeProps) {
  return (
    <Card elevation="flat" padding="sm" className={className}>
      <p className="text-xs text-[var(--color-text-muted)]">{label}</p>
      <p className="text-lg font-semibold text-[var(--color-text-primary)]">
        {value}
      </p>
    </Card>
  );
}
