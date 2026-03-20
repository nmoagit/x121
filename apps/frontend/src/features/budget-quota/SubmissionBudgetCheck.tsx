/**
 * SubmissionBudgetCheck -- inline widget for job submission forms showing
 * budget remaining, estimated cost vs remaining, and warning/blocked states (PRD-93).
 */

import { Badge ,  WireframeLoader } from "@/components/primitives";
import { cn } from "@/lib/cn";

import { useBudgetCheck } from "./hooks/use-budget-quota";
import type { BudgetCheckResult } from "./types";
import { BUDGET_CHECK_BADGE } from "./types";

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

const STATUS_LABEL: Record<string, string> = {
  allowed: "Budget OK",
  warning: "Budget Warning",
  blocked: "Budget Exceeded",
  no_budget: "No Budget Set",
};

/* --------------------------------------------------------------------------
   Static variant (when check result is provided externally)
   -------------------------------------------------------------------------- */

interface StaticCheckProps {
  check: BudgetCheckResult;
  estimatedHours: number;
}

function StaticBudgetCheck({ check, estimatedHours }: StaticCheckProps) {
  const variant = BUDGET_CHECK_BADGE[check.status] ?? "default";
  const label = STATUS_LABEL[check.status] ?? check.status;

  return (
    <div
      data-testid="submission-budget-check"
      className={cn(
        "flex items-center gap-3 px-3 py-2 rounded-[var(--radius-md)]",
        "border",
        check.status === "blocked"
          ? "border-[var(--color-action-danger)]/30 bg-[var(--color-action-danger)]/5"
          : check.status === "warning"
            ? "border-[var(--color-action-warning)]/30 bg-[var(--color-action-warning)]/5"
            : "border-[var(--color-border-default)] bg-[var(--color-surface-secondary)]",
      )}
    >
      <Badge variant={variant} size="sm">{label}</Badge>

      <div className="flex-1 flex flex-col gap-0.5">
        {check.message && (
          <span data-testid="check-message" className="text-xs text-[var(--color-text-secondary)]">
            {check.message}
          </span>
        )}
        <div className="flex items-center gap-3 text-xs text-[var(--color-text-muted)]">
          <span>
            Est. cost: <span className="font-medium tabular-nums">{estimatedHours.toFixed(2)}h</span>
          </span>
          {check.consumed_pct != null && (
            <span>
              Used: <span className="font-medium tabular-nums">{check.consumed_pct.toFixed(0)}%</span>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------------
   Main component (with auto-fetching)
   -------------------------------------------------------------------------- */

interface SubmissionBudgetCheckProps {
  projectId: number;
  estimatedHours: number;
  /** Provide a pre-fetched result to skip the hook. */
  check?: BudgetCheckResult;
}

export function SubmissionBudgetCheck({
  projectId,
  estimatedHours,
  check: externalCheck,
}: SubmissionBudgetCheckProps) {
  const { data, isLoading, error } = useBudgetCheck(
    externalCheck ? 0 : projectId,
    externalCheck ? 0 : estimatedHours,
  );

  const checkResult = externalCheck ?? data;

  if (isLoading && !externalCheck) {
    return (
      <div data-testid="submission-budget-check-loading" className="flex items-center gap-2 py-2">
        <WireframeLoader size={32} />
        <span className="text-xs text-[var(--color-text-muted)]">Checking budget...</span>
      </div>
    );
  }

  if (error && !externalCheck) {
    return (
      <div data-testid="submission-budget-check-error" className="text-xs text-[var(--color-action-danger)] py-2">
        Failed to check budget. Submit anyway or retry.
      </div>
    );
  }

  if (!checkResult) return null;

  return <StaticBudgetCheck check={checkResult} estimatedHours={estimatedHours} />;
}
