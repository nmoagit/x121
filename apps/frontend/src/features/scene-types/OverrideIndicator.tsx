/**
 * Override indicator for scene type inheritance (PRD-100).
 *
 * Shows the source of a field value -- own override, inherited, or from a mixin.
 */

import { Badge } from "@/components/primitives/Badge";
import { Button } from "@/components/primitives/Button";
import type { FieldSource } from "./types";

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface OverrideIndicatorProps {
  fieldName: string;
  source: FieldSource;
  onToggleOverride?: () => void;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function OverrideIndicator({ fieldName, source, onToggleOverride }: OverrideIndicatorProps) {
  if (source.type === "own") {
    return (
      <span className="inline-flex items-center gap-1.5" data-testid={`override-${fieldName}`}>
        <Badge variant="warning" size="sm">
          Overridden
        </Badge>
        {onToggleOverride && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggleOverride}
            aria-label={`Revert ${fieldName} to inherited value`}
          >
            Revert
          </Button>
        )}
      </span>
    );
  }

  if (source.type === "inherited") {
    return (
      <span
        className="text-xs text-[var(--color-text-muted)]"
        data-testid={`override-${fieldName}`}
      >
        Inherited from {source.from_name ?? `#${source.from_id}`}
      </span>
    );
  }

  // source.type === "mixin"
  return (
    <span className="text-xs text-[var(--color-text-muted)]" data-testid={`override-${fieldName}`}>
      From mixin: {source.mixin_name ?? `#${source.mixin_id}`}
    </span>
  );
}
