/**
 * Branch comparison component (PRD-50).
 *
 * Displays a side-by-side parameter comparison between two branches
 * with color-coded diffs and segment count comparison.
 */

import { Badge } from "@/components";
import { formatValue } from "@/lib/format";

import type { BranchComparison as BranchComparisonData, ParameterDiff } from "./types";

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

const DIFF_STATUS_COLORS: Record<ParameterDiff["status"], string> = {
  added: "bg-green-50 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  removed: "bg-red-50 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  changed:
    "bg-yellow-50 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  unchanged: "",
};

const DIFF_STATUS_LABELS: Record<ParameterDiff["status"], string> = {
  added: "Added",
  removed: "Removed",
  changed: "Changed",
  unchanged: "Unchanged",
};

const DIFF_BADGE_VARIANTS: Record<
  ParameterDiff["status"],
  "success" | "danger" | "warning" | "default"
> = {
  added: "success",
  removed: "danger",
  changed: "warning",
  unchanged: "default",
};

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface BranchComparisonProps {
  /** The comparison data from the API. */
  comparison: BranchComparisonData;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function BranchComparison({ comparison }: BranchComparisonProps) {
  const { branch_a, branch_b, diffs } = comparison;

  const changedCount = diffs.filter(
    (d) => d.status !== "unchanged",
  ).length;

  return (
    <div data-testid="branch-comparison" className="space-y-4">
      {/* Branch summary header */}
      <div className="grid grid-cols-2 gap-4">
        <div
          data-testid="branch-a-summary"
          className="rounded border border-[var(--color-border-subtle)] bg-[var(--color-surface-secondary)] p-3"
        >
          <h4 className="text-sm font-semibold text-[var(--color-text-primary)]">
            {branch_a.name}
          </h4>
          <p
            data-testid="segment-count-a"
            className="text-xs text-[var(--color-text-muted)]"
          >
            {branch_a.segment_count} segment{branch_a.segment_count !== 1 ? "s" : ""}
          </p>
          {branch_a.is_default && (
            <Badge variant="info">Default</Badge>
          )}
        </div>
        <div
          data-testid="branch-b-summary"
          className="rounded border border-[var(--color-border-subtle)] bg-[var(--color-surface-secondary)] p-3"
        >
          <h4 className="text-sm font-semibold text-[var(--color-text-primary)]">
            {branch_b.name}
          </h4>
          <p
            data-testid="segment-count-b"
            className="text-xs text-[var(--color-text-muted)]"
          >
            {branch_b.segment_count} segment{branch_b.segment_count !== 1 ? "s" : ""}
          </p>
          {branch_b.is_default && (
            <Badge variant="info">Default</Badge>
          )}
        </div>
      </div>

      {/* Diff summary */}
      <p className="text-xs text-[var(--color-text-secondary)]">
        {changedCount} difference{changedCount !== 1 ? "s" : ""} found across{" "}
        {diffs.length} parameter{diffs.length !== 1 ? "s" : ""}.
      </p>

      {/* Diff table */}
      {diffs.length === 0 ? (
        <p
          data-testid="no-diffs"
          className="py-4 text-center text-sm text-[var(--color-text-muted)]"
        >
          Both branches have identical parameters.
        </p>
      ) : (
        <div className="overflow-hidden rounded border border-[var(--color-border-subtle)]">
          <table className="w-full text-sm" data-testid="diff-table">
            <thead>
              <tr className="bg-[var(--color-surface-tertiary)] text-xs text-[var(--color-text-secondary)]">
                <th className="px-3 py-2 text-left font-medium">Parameter</th>
                <th className="px-3 py-2 text-left font-medium">
                  {branch_a.name}
                </th>
                <th className="px-3 py-2 text-left font-medium">
                  {branch_b.name}
                </th>
                <th className="px-3 py-2 text-left font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {diffs.map((diff) => (
                <tr
                  key={diff.key}
                  data-testid={`diff-row-${diff.key}`}
                  className={DIFF_STATUS_COLORS[diff.status]}
                >
                  <td className="px-3 py-1.5 font-mono text-xs">
                    {diff.key}
                  </td>
                  <td className="px-3 py-1.5 text-xs">
                    {formatValue(diff.value_a)}
                  </td>
                  <td className="px-3 py-1.5 text-xs">
                    {formatValue(diff.value_b)}
                  </td>
                  <td className="px-3 py-1.5">
                    <Badge variant={DIFF_BADGE_VARIANTS[diff.status]}>
                      {DIFF_STATUS_LABELS[diff.status]}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
