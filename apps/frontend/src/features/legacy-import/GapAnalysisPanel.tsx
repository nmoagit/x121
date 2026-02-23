/**
 * Gap analysis report display (PRD-86).
 */

import type { GapEntry, GapReport } from "./types";

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

const GAP_TYPE_LABELS: Record<string, string> = {
  missing_metadata: "Missing Metadata",
  missing_source_image: "Missing Source Image",
  missing_scene: "Missing Scene",
};

const GAP_TYPE_COLORS: Record<string, string> = {
  missing_metadata: "text-yellow-600",
  missing_source_image: "text-orange-600",
  missing_scene: "text-red-600",
};

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

export interface GapAnalysisPanelProps {
  /** Gap report data from the server. */
  gapReport: GapReport;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function GapAnalysisPanel({ gapReport }: GapAnalysisPanelProps) {
  const gaps = gapReport.gaps ?? [];
  const summary = gapReport.summary ?? {};

  return (
    <div data-testid="gap-analysis-panel" className="space-y-4">
      <h3 className="text-lg font-medium text-[var(--color-text-primary)]">
        Gap Analysis
      </h3>

      {gaps.length === 0 && Object.keys(summary).length === 0 ? (
        <p
          data-testid="no-gaps"
          className="text-sm text-[var(--color-text-secondary)]"
        >
          No gaps detected. All entities have complete data.
        </p>
      ) : (
        <>
          {Object.keys(summary).length > 0 && (
            <div
              data-testid="gap-summary"
              className="flex gap-4 text-sm"
            >
              {Object.entries(summary).map(([type, count]) => (
                <span
                  key={type}
                  data-testid={`gap-summary-${type}`}
                  className={`rounded px-2 py-1 ${GAP_TYPE_COLORS[type] ?? "text-gray-600"}`}
                >
                  {GAP_TYPE_LABELS[type] ?? type}: {count}
                </span>
              ))}
            </div>
          )}

          {gaps.length > 0 && (
            <ul data-testid="gap-list" className="space-y-2">
              {gaps.map((gap, idx) => (
                <GapItem key={idx} gap={gap} index={idx} />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

/* --------------------------------------------------------------------------
   Sub-component
   -------------------------------------------------------------------------- */

function GapItem({ gap, index }: { gap: GapEntry; index: number }) {
  return (
    <li
      data-testid={`gap-item-${index}`}
      className="flex items-start gap-3 rounded border p-3 text-sm"
    >
      <span
        className={`font-medium ${GAP_TYPE_COLORS[gap.gap_type] ?? "text-gray-600"}`}
      >
        {GAP_TYPE_LABELS[gap.gap_type] ?? gap.gap_type}
      </span>
      <div className="flex-1">
        <span className="font-medium">{gap.entity_name}</span>
        <p className="text-xs text-[var(--color-text-secondary)]">
          {gap.details}
        </p>
      </div>
    </li>
  );
}
