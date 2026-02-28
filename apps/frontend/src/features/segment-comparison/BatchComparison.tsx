/**
 * Sequential review of multiple regenerated segments (PRD-101).
 *
 * Renders one `RegenerationComparison` at a time with navigation controls,
 * a progress bar, and a summary screen upon completion.
 */

import { useCallback, useState } from "react";

import { Badge, Button } from "@/components/primitives";
import { ArrowLeft, ArrowRight } from "@/tokens/icons";

import { RegenerationComparison } from "./RegenerationComparison";
import type { BatchSummary, ComparisonDecision } from "./types";

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface BatchComparisonProps {
  /** Array of [segmentId, oldVersion, newVersion] tuples. */
  segments: Array<{ segmentId: number; oldVersion: number; newVersion: number }>;
  onComplete: (summary: BatchSummary) => void;
}

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

const INITIAL_SUMMARY: BatchSummary = {
  kept_new: 0,
  reverted: 0,
  kept_both: 0,
  skipped: 0,
  total: 0,
};

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function BatchComparison({ segments, onComplete }: BatchComparisonProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [summary, setSummary] = useState<BatchSummary>({
    ...INITIAL_SUMMARY,
    total: segments.length,
  });
  const [isComplete, setIsComplete] = useState(false);

  const advanceOrFinish = useCallback(
    (updatedSummary: BatchSummary) => {
      if (currentIndex >= segments.length - 1) {
        setIsComplete(true);
        onComplete(updatedSummary);
      } else {
        setCurrentIndex((prev) => prev + 1);
      }
    },
    [currentIndex, segments.length, onComplete],
  );

  const handleDecision = useCallback(
    (decision: ComparisonDecision) => {
      const updated = { ...summary };
      switch (decision) {
        case "keep_new":
          updated.kept_new += 1;
          break;
        case "revert":
          updated.reverted += 1;
          break;
        case "keep_both":
          updated.kept_both += 1;
          break;
      }
      setSummary(updated);
      advanceOrFinish(updated);
    },
    [summary, advanceOrFinish],
  );

  const handleSkip = useCallback(() => {
    const updated = { ...summary, skipped: summary.skipped + 1 };
    setSummary(updated);
    advanceOrFinish(updated);
  }, [summary, advanceOrFinish]);

  const handlePrevious = useCallback(() => {
    setCurrentIndex((prev) => Math.max(0, prev - 1));
  }, []);

  // Summary screen
  if (isComplete) {
    return (
      <div
        data-testid="batch-summary"
        className="space-y-4 p-[var(--spacing-6)] rounded-[var(--radius-lg)] bg-[var(--color-surface-secondary)] border border-[var(--color-border-default)]"
      >
        <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">Review Complete</h2>

        <div className="grid grid-cols-2 gap-[var(--spacing-3)] sm:grid-cols-4">
          <SummaryItem label="Kept New" value={summary.kept_new} variant="success" />
          <SummaryItem label="Reverted" value={summary.reverted} variant="warning" />
          <SummaryItem label="Kept Both" value={summary.kept_both} variant="info" />
          <SummaryItem label="Skipped" value={summary.skipped} variant="default" />
        </div>

        <p className="text-sm text-[var(--color-text-muted)]">
          Reviewed {summary.kept_new + summary.reverted + summary.kept_both + summary.skipped} of{" "}
          {summary.total} segments
        </p>
      </div>
    );
  }

  const current = segments[currentIndex];
  if (!current) return null;

  const progressPercent = ((currentIndex + 1) / segments.length) * 100;

  return (
    <div data-testid="batch-comparison" className="space-y-4">
      {/* Progress bar */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-sm">
          <span className="text-[var(--color-text-secondary)]">
            Reviewing {currentIndex + 1} of {segments.length}
          </span>
          <span className="text-[var(--color-text-muted)]">{Math.round(progressPercent)}%</span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-[var(--color-surface-tertiary)] overflow-hidden">
          <div
            data-testid="batch-progress-bar"
            className="h-full rounded-full bg-[var(--color-action-primary)] transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Current comparison */}
      <RegenerationComparison
        segmentId={current.segmentId}
        oldVersion={current.oldVersion}
        newVersion={current.newVersion}
        onDecision={handleDecision}
      />

      {/* Navigation */}
      <div className="flex items-center justify-between pt-2 border-t border-[var(--color-border-default)]">
        <Button
          variant="ghost"
          size="sm"
          icon={<ArrowLeft size={16} />}
          disabled={currentIndex === 0}
          onClick={handlePrevious}
          data-testid="batch-prev"
        >
          Previous
        </Button>

        <Button variant="ghost" size="sm" onClick={handleSkip} data-testid="batch-skip">
          Skip
        </Button>

        <Button
          variant="ghost"
          size="sm"
          icon={<ArrowRight size={16} />}
          onClick={handleSkip}
          data-testid="batch-next"
        >
          {currentIndex === segments.length - 1 ? "Finish" : "Next"}
        </Button>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------------
   Sub-components
   -------------------------------------------------------------------------- */

function SummaryItem({
  label,
  value,
  variant,
}: {
  label: string;
  value: number;
  variant: "success" | "warning" | "info" | "default";
}) {
  return (
    <div className="flex flex-col items-center gap-1 p-[var(--spacing-3)] rounded-[var(--radius-md)] bg-[var(--color-surface-primary)]">
      <Badge variant={variant} size="sm">
        {label}
      </Badge>
      <span className="text-2xl font-bold text-[var(--color-text-primary)]">{value}</span>
    </div>
  );
}
