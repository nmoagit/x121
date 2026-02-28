/**
 * Failure analytics page (PRD-64).
 *
 * Composes a failure heatmap with dimension selectors and an optional
 * trend chart for a selected pattern. Clicking a heatmap cell reveals
 * the pattern detail panel.
 */

import { useState } from "react";

import { Stack } from "@/components/layout";

import {
  FailureHeatmap,
  FailureTrendChart,
  PatternDetail,
  useFailurePatterns,
} from "@/features/failure-analytics";
import type { FailurePattern } from "@/features/failure-analytics";

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function FailureAnalyticsPage() {
  const [selectedPattern, setSelectedPattern] =
    useState<FailurePattern | null>(null);

  const { data: patterns } = useFailurePatterns({ limit: 50 });

  return (
    <div className="min-h-full">
      <Stack gap={6}>
        <div>
          <h1 className="text-xl font-semibold text-[var(--color-text-primary)]">
            Failure Analytics
          </h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            Identify failure patterns across workflows, characters, and scene
            types.
          </p>
        </div>

        {/* Heatmap */}
        <FailureHeatmap />

        {/* Pattern list */}
        {patterns && patterns.length > 0 && (
          <div>
            <h2 className="mb-2 text-sm font-medium text-[var(--color-text-secondary)]">
              Failure Patterns
            </h2>
            <div className="flex flex-wrap gap-2">
              {patterns.map((pattern) => (
                <button
                  key={pattern.id}
                  type="button"
                  onClick={() => setSelectedPattern(pattern)}
                  className={`rounded-md border px-3 py-1.5 text-xs transition-colors ${
                    selectedPattern?.id === pattern.id
                      ? "border-[var(--color-border-accent)] bg-[var(--color-surface-secondary)]"
                      : "border-[var(--color-border-default)] hover:bg-[var(--color-surface-secondary)]"
                  }`}
                >
                  #{pattern.id} &mdash;{" "}
                  {(pattern.failure_rate * 100).toFixed(0)}% failure
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Pattern detail + trend chart */}
        {selectedPattern && (
          <div className="grid gap-6 lg:grid-cols-2">
            <PatternDetail pattern={selectedPattern} />
            <FailureTrendChart patternId={selectedPattern.id} />
          </div>
        )}

        {/* Empty state when no pattern selected */}
        {!selectedPattern && (
          <p className="text-sm text-[var(--color-text-muted)]">
            Select a pattern above to view details and trend data.
          </p>
        )}
      </Stack>
    </div>
  );
}
