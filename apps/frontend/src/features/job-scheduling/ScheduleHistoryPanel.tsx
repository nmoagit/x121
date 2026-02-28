/**
 * Schedule execution history panel (PRD-119).
 *
 * Displays the execution history for a given schedule in a table format
 * with status badges, job links, durations, and error messages.
 */

import { Badge, Spinner } from "@/components/primitives";
import { Stack } from "@/components/layout";
import { cn } from "@/lib/cn";
import { formatDateTime, formatDuration } from "@/lib/format";

import { useScheduleHistory } from "./hooks/use-job-scheduling";
import { HISTORY_STATUS_BADGE } from "./types";
import type { ScheduleHistory } from "./types";

/* --------------------------------------------------------------------------
   Sub-components
   -------------------------------------------------------------------------- */

function HistoryRow({ entry }: { entry: ScheduleHistory }) {
  return (
    <tr
      className={cn(
        "border-b border-[var(--color-border-default)] last:border-b-0",
        "hover:bg-[var(--color-surface-tertiary)]/50",
        "transition-colors duration-[var(--duration-instant)]",
      )}
    >
      <td className="px-3 py-2 text-sm text-[var(--color-text-primary)]">
        {formatDateTime(entry.executed_at)}
      </td>
      <td className="px-3 py-2">
        <Badge
          variant={HISTORY_STATUS_BADGE[entry.status]}
          size="sm"
        >
          {entry.status}
        </Badge>
      </td>
      <td className="px-3 py-2 text-sm text-[var(--color-text-secondary)]">
        {entry.result_job_id ? `#${entry.result_job_id}` : "\u2014"}
      </td>
      <td className="px-3 py-2 text-sm text-[var(--color-text-secondary)]">
        {entry.execution_duration_ms != null
          ? formatDuration(entry.execution_duration_ms)
          : "\u2014"}
      </td>
      <td className="px-3 py-2 text-sm text-[var(--color-action-danger)] max-w-[200px] truncate">
        {entry.error_message ?? ""}
      </td>
    </tr>
  );
}

/* --------------------------------------------------------------------------
   Main component
   -------------------------------------------------------------------------- */

interface ScheduleHistoryPanelProps {
  scheduleId: number;
}

export function ScheduleHistoryPanel({ scheduleId }: ScheduleHistoryPanelProps) {
  const { data, isPending, isError } = useScheduleHistory(scheduleId);

  if (isPending) {
    return (
      <div className="flex items-center justify-center py-8" data-testid="history-loading">
        <Spinner size="md" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="px-4 py-8 text-center text-sm text-[var(--color-text-muted)]">
        Failed to load execution history.
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="px-4 py-8 text-center text-sm text-[var(--color-text-muted)]" data-testid="history-empty">
        No execution history yet.
      </div>
    );
  }

  return (
    <div data-testid="schedule-history-panel">
      <Stack direction="vertical" gap={2}>
        <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
          Execution History
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-[var(--color-border-default)]">
                <th className="px-3 py-2 text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide">
                  Executed At
                </th>
                <th className="px-3 py-2 text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide">
                  Status
                </th>
                <th className="px-3 py-2 text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide">
                  Job
                </th>
                <th className="px-3 py-2 text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide">
                  Duration
                </th>
                <th className="px-3 py-2 text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide">
                  Error
                </th>
              </tr>
            </thead>
            <tbody>
              {data.map((entry) => (
                <HistoryRow key={entry.id} entry={entry} />
              ))}
            </tbody>
          </table>
        </div>
      </Stack>
    </div>
  );
}
