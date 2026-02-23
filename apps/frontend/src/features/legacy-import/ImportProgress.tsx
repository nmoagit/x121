/**
 * Import progress tracking and final report display (PRD-86).
 */

import type { ImportRunStatus, LegacyImportRun, RunReport } from "./types";

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

const STATUS_LABELS: Record<ImportRunStatus, string> = {
  scanning: "Scanning...",
  mapping: "Mapping...",
  preview: "Preview Ready",
  importing: "Importing...",
  completed: "Completed",
  partial: "Partially Completed",
  failed: "Failed",
  cancelled: "Cancelled",
};

const STATUS_COLORS: Record<ImportRunStatus, string> = {
  scanning: "text-blue-600",
  mapping: "text-blue-600",
  preview: "text-yellow-600",
  importing: "text-blue-600",
  completed: "text-green-600",
  partial: "text-orange-600",
  failed: "text-red-600",
  cancelled: "text-gray-500",
};

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

export interface ImportProgressProps {
  /** The import run data. */
  run: LegacyImportRun;
  /** The status name (resolved from status_id). */
  statusName: ImportRunStatus;
  /** Full report data (optional, available after completion). */
  report?: RunReport | null;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function ImportProgress({
  run,
  statusName,
  report,
}: ImportProgressProps) {
  const isActive = statusName === "scanning" || statusName === "mapping" || statusName === "importing";

  return (
    <div data-testid="import-progress" className="space-y-4">
      <div className="flex items-center gap-3">
        <h3 className="text-lg font-medium text-[var(--color-text-primary)]">
          Import Progress
        </h3>
        <span
          data-testid="status-badge"
          className={`text-sm font-medium ${STATUS_COLORS[statusName] ?? "text-gray-600"}`}
        >
          {STATUS_LABELS[statusName] ?? statusName}
        </span>
        {isActive && (
          <span
            data-testid="spinner"
            className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-blue-600 border-t-transparent"
          />
        )}
      </div>

      <div
        data-testid="counts-grid"
        className="grid grid-cols-2 gap-3 sm:grid-cols-4"
      >
        <CountCard label="Total Files" value={run.total_files} testId="total-files" />
        <CountCard label="Characters Created" value={run.characters_created} testId="chars-created" />
        <CountCard label="Characters Updated" value={run.characters_updated} testId="chars-updated" />
        <CountCard label="Scenes Registered" value={run.scenes_registered} testId="scenes-registered" />
        <CountCard label="Images Registered" value={run.images_registered} testId="images-registered" />
        <CountCard label="Duplicates" value={run.duplicates_found} testId="duplicates" />
        <CountCard label="Errors" value={run.errors} testId="errors" />
      </div>

      {report && (
        <div data-testid="action-summary" className="mt-4">
          <h4 className="mb-2 text-sm font-medium text-[var(--color-text-secondary)]">
            Action Summary
          </h4>
          <div className="flex gap-4 text-sm">
            {report.action_counts.map(({ action, count }) => (
              <span
                key={action}
                data-testid={`action-count-${action}`}
                className="rounded bg-gray-100 px-2 py-1"
              >
                {action}: {count}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

function CountCard({
  label,
  value,
  testId,
}: {
  label: string;
  value: number;
  testId: string;
}) {
  return (
    <div
      data-testid={testId}
      className="rounded border p-3 text-center"
    >
      <div className="text-2xl font-bold text-[var(--color-text-primary)]">
        {value}
      </div>
      <div className="text-xs text-[var(--color-text-secondary)]">{label}</div>
    </div>
  );
}
