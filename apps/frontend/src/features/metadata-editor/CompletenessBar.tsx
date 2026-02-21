/**
 * Completeness progress bar for character metadata (PRD-66).
 *
 * Shows a visual bar with percentage, count text, and expandable
 * list of missing required fields.
 */

import { useState } from "react";

import type { CompletenessResult } from "./types";

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

const COMPLETE_THRESHOLD = 100;

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

interface CompletenessBarProps {
  completeness: CompletenessResult;
}

export function CompletenessBar({ completeness }: CompletenessBarProps) {
  const [expanded, setExpanded] = useState(false);
  const { percentage, filled, total_required, missing_fields } = completeness;
  const isComplete = percentage >= COMPLETE_THRESHOLD;

  const barColor = isComplete
    ? "bg-[var(--color-status-success)]"
    : percentage >= 50
      ? "bg-[var(--color-status-warning)]"
      : "bg-[var(--color-status-error)]";

  return (
    <div className="space-y-1">
      {/* Progress bar */}
      <div className="flex items-center gap-3">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--color-surface-tertiary)]">
          <div
            className={`h-full rounded-full transition-all duration-300 ${barColor}`}
            style={{ width: `${Math.min(percentage, 100)}%` }}
          />
        </div>
        <span className="min-w-[80px] text-right text-xs text-[var(--color-text-muted)]">
          {filled} / {total_required} required
        </span>
      </div>

      {/* Missing fields */}
      {missing_fields.length > 0 && (
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          className="text-xs text-[var(--color-text-muted)] underline decoration-dotted hover:text-[var(--color-text-secondary)]"
        >
          {expanded ? "Hide" : "Show"} {missing_fields.length} missing field
          {missing_fields.length !== 1 ? "s" : ""}
        </button>
      )}

      {expanded && missing_fields.length > 0 && (
        <div className="mt-1 text-xs text-[var(--color-status-error)]">
          Missing: {missing_fields.join(", ")}
        </div>
      )}
    </div>
  );
}
