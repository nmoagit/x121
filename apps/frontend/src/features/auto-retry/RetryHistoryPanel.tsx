import { ContextLoader } from "@/components/primitives";
/**
 * Retry history panel (PRD-71).
 *
 * Displays all retry attempts for a segment with status badges,
 * quality scores, and best-of-N selection indicator.
 */

import { useCallback, useState } from "react";


import { AttemptRow } from "./AttemptRow";
import { useRetryAttempts, useSelectRetryAttempt } from "./hooks/use-auto-retry";

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface RetryHistoryPanelProps {
  segmentId: number;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function RetryHistoryPanel({ segmentId }: RetryHistoryPanelProps) {
  const { data: attempts, isPending } = useRetryAttempts(segmentId);
  const selectMutation = useSelectRetryAttempt();
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const totalGpuSeconds = attempts?.reduce((sum, a) => sum + (a.gpu_seconds ?? 0), 0) ?? 0;

  const handleToggle = useCallback((id: number) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  const handleSelect = useCallback(
    (attemptId: number) => {
      selectMutation.mutate({ segmentId, attemptId });
    },
    [segmentId, selectMutation],
  );

  if (isPending) {
    return (
      <div className="flex items-center justify-center py-8" data-testid="retry-history-loading">
        <ContextLoader size={48} />
      </div>
    );
  }

  if (!attempts || attempts.length === 0) {
    return (
      <div
        className="py-6 text-center text-sm text-[var(--color-text-muted)]"
        data-testid="retry-history-empty"
      >
        No retry attempts for this segment.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4" data-testid="retry-history-panel">
      {/* Header */}
      <div className="flex items-center justify-between" data-testid="retry-history-header">
        <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
          Retry Attempts ({attempts.length})
        </h3>
        <span
          className="text-xs text-[var(--color-text-muted)]"
          data-testid="retry-history-gpu-total"
        >
          Total GPU: {totalGpuSeconds.toFixed(1)}s
        </span>
      </div>

      {/* Attempt list */}
      <ul className="flex flex-col gap-2" data-testid="retry-attempt-list">
        {attempts.map((attempt) => (
          <AttemptRow
            key={attempt.id}
            attempt={attempt}
            isExpanded={expandedId === attempt.id}
            onToggle={() => handleToggle(attempt.id)}
            onSelect={() => handleSelect(attempt.id)}
            isSelecting={
              selectMutation.isPending && selectMutation.variables?.attemptId === attempt.id
            }
          />
        ))}
      </ul>
    </div>
  );
}
