/**
 * VerificationPanel -- displays verification result details for a backup (PRD-81).
 *
 * Shows pass/fail status, restore duration, query results, and any errors.
 */

import { Badge } from "@/components/primitives";

import type { VerificationResult } from "./types";

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

interface VerificationPanelProps {
  result: VerificationResult;
}

export function VerificationPanel({ result }: VerificationPanelProps) {
  const allPassed = result.queries_passed === result.queries_total;

  return (
    <div data-testid="verification-panel" className="flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-[var(--color-text-primary)]">
          Verification Result
        </span>
        <Badge variant={result.success ? "success" : "danger"} size="sm">
          {result.success ? "Passed" : "Failed"}
        </Badge>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="flex flex-col gap-0.5">
          <span className="text-xs text-[var(--color-text-muted)]">Restore Duration</span>
          <span className="text-sm font-medium text-[var(--color-text-primary)] tabular-nums">
            {result.restore_duration_secs.toFixed(1)}s
          </span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-xs text-[var(--color-text-muted)]">Queries Passed</span>
          <span className="text-sm font-medium text-[var(--color-text-primary)] tabular-nums">
            {result.queries_passed} / {result.queries_total}
          </span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-xs text-[var(--color-text-muted)]">Status</span>
          <Badge variant={allPassed ? "success" : "warning"} size="sm">
            {allPassed ? "All Passed" : "Partial"}
          </Badge>
        </div>
      </div>

      {/* Errors */}
      {result.errors.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-[var(--color-action-danger)]">
            Errors ({result.errors.length})
          </span>
          <ul className="flex flex-col gap-1">
            {result.errors.map((err, idx) => (
              <li
                key={idx}
                className="text-xs text-[var(--color-text-secondary)] bg-[var(--color-action-danger)]/5 px-2 py-1 rounded-[var(--radius-sm)]"
              >
                {err}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
