/**
 * Single retry attempt row (PRD-71).
 *
 * Expandable row showing attempt number, status badge, seed,
 * quality scores, and best-of-N selection button.
 */

import { Badge } from "@/components/primitives/Badge";
import { Button } from "@/components/primitives/Button";
import { Tooltip } from "@/components/primitives";
import { cn } from "@/lib/cn";

import type { RetryAttempt } from "./types";
import { ATTEMPT_STATUS_BADGE_VARIANT } from "./types";

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface AttemptRowProps {
  attempt: RetryAttempt;
  isExpanded: boolean;
  onToggle: () => void;
  onSelect: () => void;
  isSelecting: boolean;
}

/* --------------------------------------------------------------------------
   Sub-component: quality scores grid
   -------------------------------------------------------------------------- */

function AttemptScores({ scores }: { scores: Record<string, number> }) {
  const entries = Object.entries(scores);
  if (entries.length === 0) return null;

  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-2" data-testid="attempt-scores">
      {entries.map(([key, value]) => (
        <div key={key} className="flex items-center justify-between text-xs">
          <span className="text-[var(--color-text-muted)]">{key}</span>
          <span className="text-[var(--color-text-primary)] font-mono">{value.toFixed(2)}</span>
        </div>
      ))}
    </div>
  );
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function AttemptRow({
  attempt,
  isExpanded,
  onToggle,
  onSelect,
  isSelecting,
}: AttemptRowProps) {
  const canSelect =
    !attempt.is_selected &&
    (attempt.overall_status === "passed" || attempt.overall_status === "failed");

  return (
    <li
      className={cn(
        "border border-[var(--color-border-default)] rounded-[var(--radius-md)]",
        "bg-[var(--color-surface-secondary)]",
        attempt.is_selected && "ring-2 ring-[var(--color-action-success)]",
      )}
      data-testid={`attempt-row-${attempt.id}`}
    >
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          "w-full text-left px-4 py-3",
          "hover:bg-[var(--color-surface-tertiary)]",
          "transition-colors duration-[var(--duration-fast)]",
        )}
        data-testid={`attempt-toggle-${attempt.id}`}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {attempt.is_selected && (
              <Tooltip content="Selected attempt">
                <span
                  className="text-[var(--color-action-success)] text-sm font-bold"
                  data-testid={`attempt-selected-${attempt.id}`}
                >
                  &#10003;
                </span>
              </Tooltip>
            )}
            <span className="text-sm font-medium text-[var(--color-text-primary)]">
              Attempt #{attempt.attempt_number}
            </span>
            <Badge variant={ATTEMPT_STATUS_BADGE_VARIANT[attempt.overall_status]} size="sm">
              {attempt.overall_status}
            </Badge>
          </div>
          <div className="flex items-center gap-3 text-xs text-[var(--color-text-muted)]">
            <span data-testid={`attempt-seed-${attempt.id}`}>Seed: {attempt.seed}</span>
            {attempt.gpu_seconds != null && (
              <span data-testid={`attempt-gpu-${attempt.id}`}>
                {attempt.gpu_seconds.toFixed(1)}s GPU
              </span>
            )}
          </div>
        </div>
      </button>

      {isExpanded && (
        <div
          className="px-4 pb-3 border-t border-[var(--color-border-default)]"
          data-testid={`attempt-details-${attempt.id}`}
        >
          {attempt.quality_scores && <AttemptScores scores={attempt.quality_scores} />}
          {attempt.failure_reason && (
            <p className="mt-2 text-xs text-[var(--color-action-danger)]">
              Failure: {attempt.failure_reason}
            </p>
          )}
          <div className="mt-3 text-xs text-[var(--color-text-muted)]">
            <details>
              <summary className="cursor-pointer hover:text-[var(--color-text-secondary)]">
                Parameters
              </summary>
              <pre className="mt-1 p-2 bg-[var(--color-surface-primary)] rounded-[var(--radius-sm)] overflow-x-auto text-[10px]">
                {JSON.stringify(attempt.parameters, null, 2)}
              </pre>
            </details>
          </div>
          {canSelect && (
            <div className="mt-3">
              <Button
                variant="secondary"
                size="sm"
                onClick={onSelect}
                loading={isSelecting}
                data-testid={`attempt-select-btn-${attempt.id}`}
              >
                Select as Best
              </Button>
            </div>
          )}
        </div>
      )}
    </li>
  );
}
