/**
 * Scene QA Summary Card — displays aggregate QA results for a scene (PRD-49).
 *
 * Shows total segments, failures, warnings, and all-passed count
 * with a color-coded progress bar.
 */

import { Card, CardBody, CardHeader } from "@/components/composite";
import { cn } from "@/lib/cn";

import type { SceneQaSummary } from "./types";

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface SceneQaSummaryCardProps {
  summary: SceneQaSummary;
}

/* --------------------------------------------------------------------------
   Progress bar segment
   -------------------------------------------------------------------------- */

function BarSegment({
  value,
  total,
  color,
  label,
}: {
  value: number;
  total: number;
  color: string;
  label: string;
}) {
  if (total === 0 || value === 0) return null;
  const pct = (value / total) * 100;

  return (
    <div
      data-testid={`bar-segment-${label}`}
      className="h-full transition-all"
      style={{ width: `${pct}%`, backgroundColor: color }}
      title={`${label}: ${value}`}
      aria-label={`${label}: ${value} of ${total}`}
    />
  );
}

/* --------------------------------------------------------------------------
   Main component
   -------------------------------------------------------------------------- */

export function SceneQaSummaryCard({ summary }: SceneQaSummaryCardProps) {
  const { total_segments, segments_with_failures, segments_with_warnings, all_passed } =
    summary;

  const hasFailures = segments_with_failures > 0;

  return (
    <Card
      data-testid="scene-qa-summary"
      elevation="flat"
    >
      <CardHeader>
        <h3
          className={cn(
            "text-base font-semibold",
            hasFailures
              ? "text-[var(--color-action-danger)]"
              : "text-[var(--color-text-primary)]",
          )}
        >
          Scene QA Summary
        </h3>
      </CardHeader>
      <CardBody>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mb-4">
          <div>
            <p className="text-xs text-[var(--color-text-secondary)]">Total Segments</p>
            <p
              data-testid="stat-total"
              className="text-lg font-semibold text-[var(--color-text-primary)] tabular-nums"
            >
              {total_segments}
            </p>
          </div>
          <div>
            <p className="text-xs text-[var(--color-text-secondary)]">Failures</p>
            <p
              data-testid="stat-failures"
              className="text-lg font-semibold text-[var(--color-action-danger)] tabular-nums"
            >
              {segments_with_failures}
            </p>
          </div>
          <div>
            <p className="text-xs text-[var(--color-text-secondary)]">Warnings</p>
            <p
              data-testid="stat-warnings"
              className="text-lg font-semibold text-[var(--color-action-warning)] tabular-nums"
            >
              {segments_with_warnings}
            </p>
          </div>
          <div>
            <p className="text-xs text-[var(--color-text-secondary)]">All Passed</p>
            <p
              data-testid="stat-passed"
              className="text-lg font-semibold text-[var(--color-action-success)] tabular-nums"
            >
              {all_passed}
            </p>
          </div>
        </div>

        {/* Color-coded progress bar */}
        {total_segments > 0 && (
          <div
            data-testid="progress-bar"
            className="flex h-2 w-full rounded-[var(--radius-full)] overflow-hidden bg-[var(--color-surface-tertiary)]"
          >
            <BarSegment
              value={segments_with_failures}
              total={total_segments}
              color="var(--color-action-danger)"
              label="failures"
            />
            <BarSegment
              value={segments_with_warnings}
              total={total_segments}
              color="var(--color-action-warning)"
              label="warnings"
            />
            <BarSegment
              value={all_passed}
              total={total_segments}
              color="var(--color-action-success)"
              label="passed"
            />
          </div>
        )}
      </CardBody>
    </Card>
  );
}
